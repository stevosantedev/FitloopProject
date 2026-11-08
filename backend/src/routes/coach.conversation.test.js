import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
process.env.DATABASE_URL ??= "postgresql://fitloop:fitloop@localhost:5432/fitloop_test";
process.env.JWT_SECRET ??= "fitloop-route-test-secret-at-least-32-characters";
const { createCoachRouter } = await import("./coach.js");

async function withApi(prisma, fetchImpl, run) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = "user-a"; next(); });
  app.use("/api/coach", createCoachRouter(prisma, fetchImpl));
  app.use((error, _req, res, _next) => {
    if (error?.name === "ZodError") return res.status(400).json({ error: "Invalid request." });
    return res.status(500).json({ error: "Unexpected test error." });
  });
  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  try { await run("http://127.0.0.1:" + address.port); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test("POST message persists a user and guided coach reply in an owned conversation", async () => {
  const writes = [];
  let servicePayload;
  const prisma = {
    coachConversation: {
      findFirst: async () => ({ id: "chat-a", title: "New conversation" }),
      update: async args => { writes.push({ type: "conversation", args }); return {}; }
    },
    workoutSession: {
      findMany: async args => {
        assert.equal(args.where.userId, "user-a");
        assert.equal(args.take, 5);
        assert.deepEqual(args.orderBy, { startedAt: "desc" });
        assert.deepEqual(args.select, {
          startedAt: true,
          routine: { select: { name: true } },
          sets: { where: { completed: true }, select: {
            reps: true, weightKg: true, exercise: { select: { name: true } }
          } }
        });
        return [{
          userId: "user-a",
          startedAt: new Date("2026-11-01T10:00:00Z"),
          routine: { name: "Upper body" },
          notes: "PRIVATE SESSION NOTE",
          dailyLog: { note: "PRIVATE WELLBEING ENTRY" },
          sets: [{ reps: 8, weightKg: 60, exercise: { name: "Bench press" } }]
        }];
      }
    },
    coachPreference: { findUnique: async () => ({ style: "direct", focus: "consistency" }) },
    $transaction: async callback => callback({
      coachMessage: { create: async args => { writes.push({ type: "message", args }); return { id: "message-" + writes.length, ...args.data }; } },
      coachConversation: { update: async args => { writes.push({ type: "conversation", args }); return {}; } }
    })
  };
  const fetchImpl = async (_url, options) => {
    servicePayload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ message: "Your history shows one recent workout.", responseMode: "guided_rules" }) };
  };

  await withApi(prisma, fetchImpl, async base => {
    const response = await fetch(base + "/api/coach/conversations/chat-a/messages", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Can you review my progress?" })
    });
    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(data.messages.length, 2);
    assert.equal(data.messages[0].role, "user");
    assert.equal(data.messages[1].role, "assistant");
    assert.equal(data.responseMode, "guided_rules");
  });

  assert.equal(servicePayload.message, "Can you review my progress?");
  assert.equal(servicePayload.style, "direct");
  assert.equal(servicePayload.aiEnabled, false);
  assert.equal(servicePayload.context.recentSessions[0].exercises[0].name, "Bench press");
  assert.equal("userId" in servicePayload, false);
  const serializedPayload = JSON.stringify(servicePayload);
  assert.equal(serializedPayload.includes("user-a"), false);
  assert.equal(serializedPayload.includes("PRIVATE SESSION NOTE"), false);
  assert.equal(serializedPayload.includes("PRIVATE WELLBEING ENTRY"), false);
  assert.equal(writes.filter(item => item.type === "message").length, 2);
  assert.equal(writes.find(item => item.type === "conversation").args.data.title, "Can you review my progress?");
});

test("POST message does not query training data for a conversation owned by another account", async () => {
  let sessionReads = 0;
  const prisma = {
    coachConversation: { findFirst: async () => null },
    workoutSession: { findMany: async () => { sessionReads += 1; return []; } }
  };
  await withApi(prisma, async () => { throw new Error("Coach service should not be called."); }, async base => {
    const response = await fetch(base + "/api/coach/conversations/private-chat/messages", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" })
    });
    assert.equal(response.status, 404);
  });
  assert.equal(sessionReads, 0);
});

test("POST message leaves history unchanged when the coaching service is unavailable", async () => {
  let transactions = 0;
  const prisma = {
    coachConversation: { findFirst: async () => ({ id: "chat-a", title: "New conversation" }) },
    workoutSession: { findMany: async () => [] },
    coachPreference: { findUnique: async () => null },
    $transaction: async callback => { transactions += 1; return callback({}); }
  };
  await withApi(prisma, async () => ({ ok: false }), async base => {
    const response = await fetch(base + "/api/coach/conversations/chat-a/messages", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" })
    });
    assert.equal(response.status, 503);
  });
  assert.equal(transactions, 0);
});

test("POST message rejects blank content before querying conversation", async () => {
  let lookups = 0;
  const prisma = { coachConversation: { findFirst: async () => { lookups += 1; return null; } } };
  await withApi(prisma, async () => ({ ok: true, json: async () => ({ message: "ok" }) }), async base => {
    const response = await fetch(base + "/api/coach/conversations/chat-a/messages", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "  " })
    });
    assert.equal(response.status, 400);
  });
  assert.equal(lookups, 0);
});


test("Coach AI preference defaults off and can be enabled then revoked by its owner", async () => {
  let savedPreference = null;
  const prisma = {
    coachPreference: {
      findUnique: async () => savedPreference,
      upsert: async ({ create, update }) => {
        savedPreference = { ...(savedPreference ?? create), ...update };
        return savedPreference;
      }
    }
  };

  await withApi(prisma, async () => { throw new Error("Coach service should not be called."); }, async base => {
    const readPreference = async () => {
      const response = await fetch(base + "/api/coach/preferences");
      assert.equal(response.status, 200);
      return (await response.json()).preference;
    };
    assert.equal((await readPreference()).aiEnabled, false);

    const enable = await fetch(base + "/api/coach/preferences", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ style: "direct", focus: "consistency", aiEnabled: true })
    });
    assert.equal(enable.status, 200);
    assert.equal((await enable.json()).preference.aiEnabled, true);
    assert.equal((await readPreference()).aiEnabled, true);

    const revoke = await fetch(base + "/api/coach/preferences", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ style: "direct", focus: "consistency", aiEnabled: false })
    });
    assert.equal(revoke.status, 200);
    assert.equal((await revoke.json()).preference.aiEnabled, false);
    assert.equal((await readPreference()).aiEnabled, false);
  });
});
