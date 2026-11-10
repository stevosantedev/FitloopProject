import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { createDailyLogsRouter } from "./dailyLogs.js";

/**
 * Exercise the real HTTP route while replacing only Prisma.
 * This keeps ownership, query boundaries, validation and response behaviour testable
 * without needing a database server in the unit-test environment.
 */
async function withDailyLogApi(prismaClient, run) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.userId = "user-a";
    next();
  });
  app.use("/api/daily-logs", createDailyLogsRouter(prismaClient));
  app.use((error, _req, res, _next) => {
    if (error?.name === "ZodError") return res.status(400).json({ error: "Invalid request." });
    return res.status(500).json({ error: "Unexpected test error." });
  });

  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  try {
    await run("http://127.0.0.1:" + address.port);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("GET daily logs includes the full requested calendar window and scopes it to the account", async () => {
  let query;
  const prisma = {
    dailyLog: {
      findMany: async args => {
        query = args;
        return [];
      }
    }
  };

  const expectedStart = new Date();
  expectedStart.setUTCHours(0, 0, 0, 0);
  expectedStart.setUTCDate(expectedStart.getUTCDate() - 6);

  await withDailyLogApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/daily-logs?days=7");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { logs: [] });
  });

  assert.equal(query.where.userId, "user-a");
  assert.equal(query.where.date.gte.toISOString().slice(11), "00:00:00.000Z");
  assert.equal(query.where.date.gte.toISOString(), expectedStart.toISOString());
  assert.deepEqual(query.orderBy, { date: "desc" });
});

test("GET daily logs caps the requested history window", async () => {
  let query;
  const prisma = {
    dailyLog: {
      findMany: async args => {
        query = args;
        return [];
      }
    }
  };

  const expectedStart = new Date();
  expectedStart.setUTCHours(0, 0, 0, 0);
  expectedStart.setUTCDate(expectedStart.getUTCDate() - 89);

  await withDailyLogApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/daily-logs?days=3650");
    assert.equal(response.status, 200);
  });

  assert.equal(query.where.date.gte.toISOString(), expectedStart.toISOString());
});

test("PUT daily logs stores a calendar date as a stable UTC-midnight key", async () => {
  let upsert;
  const prisma = {
    dailyLog: {
      upsert: async args => {
        upsert = args;
        return { id: "log-a", ...args.create };
      }
    }
  };

  await withDailyLogApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/daily-logs", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: "2026-11-10", steps: 4200 })
    });
    assert.equal(response.status, 200);
  });

  assert.deepEqual(upsert.where.userId_date, {
    userId: "user-a",
    date: new Date("2026-11-10T00:00:00.000Z")
  });
  assert.equal(upsert.create.date.toISOString(), "2026-11-10T00:00:00.000Z");
  assert.equal(upsert.create.userId, "user-a");
});

test("PUT daily logs rejects impossible calendar dates", async () => {
  const prisma = { dailyLog: { upsert: async () => { throw new Error("Invalid dates must not reach storage"); } } };

  await withDailyLogApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/daily-logs", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: "2026-02-30", steps: 4200 })
    });
    assert.equal(response.status, 400);
  });
});
