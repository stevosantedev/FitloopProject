import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../prisma.js";
import { PrismaRateLimitStore } from "./prismaRateLimitStore.js";

// Two store instances model separate API processes sharing the same PostgreSQL counter.
test("Coach rate-limit buckets are shared across store instances and expire cleanly", {
  skip: !process.env.DATABASE_URL
}, async () => {
  const key = "coach-rate-limit-test:" + randomUUID();
  const expiryKey = key + ":expiry";
  const firstInstance = new PrismaRateLimitStore(prisma);
  const secondInstance = new PrismaRateLimitStore(prisma);
  firstInstance.init({ windowMs: 60 * 60 * 1000 });
  secondInstance.init({ windowMs: 60 * 60 * 1000 });

  try {
    const first = await firstInstance.increment(key);
    const second = await secondInstance.increment(key);

    assert.equal(first.totalHits, 1);
    assert.equal(second.totalHits, 2);
    assert.ok(first.resetTime instanceof Date);
    assert.equal(second.resetTime.getTime(), first.resetTime.getTime());

    // Parallel requests from separate instances must receive distinct positions in one shared count.
    const concurrent = await Promise.all(Array.from({ length: 10 }, (_, index) =>
      (index % 2 === 0 ? firstInstance : secondInstance).increment(key)
    ));
    assert.deepEqual(
      concurrent.map(result => result.totalHits).sort((left, right) => left - right),
      Array.from({ length: 10 }, (_, index) => index + 3)
    );

    // Decrement and reset are part of the store contract used by express-rate-limit.
    await secondInstance.decrement(key);
    const afterDecrement = await firstInstance.increment(key);
    assert.equal(afterDecrement.totalHits, 12);

    await secondInstance.resetKey(key);
    const afterReset = await firstInstance.increment(key);
    assert.equal(afterReset.totalHits, 1);

    // A new window starts from one hit once the previous bucket has expired.
    const shortWindow = new PrismaRateLimitStore(prisma);
    shortWindow.init({ windowMs: 40 });
    const beforeExpiry = await shortWindow.increment(expiryKey);
    await new Promise(resolve => setTimeout(resolve, 60));
    const afterExpiry = await shortWindow.increment(expiryKey);
    assert.equal(afterExpiry.totalHits, 1);
    assert.ok(afterExpiry.resetTime.getTime() > beforeExpiry.resetTime.getTime());
  } finally {
    await firstInstance.resetKey(key);
    await firstInstance.resetKey(expiryKey);
  }
});
