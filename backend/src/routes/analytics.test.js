import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { createAnalyticsRouter } from "./analytics.js";

/**
 * Run the analytics endpoint over HTTP with a small Prisma substitute.
 * This checks the real route, account filters and date window without a database.
 */
async function withAnalyticsApi(prismaClient, run) {
  const app = express();
  app.use((req, _res, next) => {
    req.userId = "user-a";
    next();
  });
  app.use("/api/analytics", createAnalyticsRouter(prismaClient));
  app.use((error, _req, res, _next) => {
    res.status(500).json({ error: "Unexpected test error." });
  });

  const server = app.listen(0);
  await once(server, "listening");
  try {
    await run("http://127.0.0.1:" + server.address().port);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("GET analytics summary scopes both histories to the account and shares a calendar window", async () => {
  const queries = {};
  const prisma = {
    dailyLog: {
      findMany: async args => {
        queries.daily = args;
        return [{ sleepMinutes: 420, activityMinutes: 30, steps: 5000 }];
      }
    },
    workoutSession: {
      findMany: async args => {
        queries.workouts = args;
        return [{
          sets: [
            { completed: true, reps: 10, weightKg: 20, exercise: { muscleGroup: "Chest" } }
          ]
        }];
      }
    }
  };

  const expectedStart = new Date();
  expectedStart.setUTCHours(0, 0, 0, 0);
  expectedStart.setUTCDate(expectedStart.getUTCDate() - 6);

  await withAnalyticsApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/analytics/summary?days=7");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      periodDays: 7,
      daily: {
        daysLogged: 1,
        averageSleepMinutes: 420,
        averageSteps: 5000,
        averageActivityMinutes: 30,
        averageMood: null,
        averageFocusMinutes: null
      },
      workouts: {
        sessionsLogged: 1,
        completedSets: 1,
        totalVolumeKg: 200,
        byMuscleGroup: { Chest: 1 }
      }
    });
  });

  assert.equal(queries.daily.where.userId, "user-a");
  assert.equal(queries.workouts.where.userId, "user-a");
  assert.equal(queries.daily.where.date.gte.toISOString(), expectedStart.toISOString());
  assert.equal(queries.workouts.where.startedAt.gte.toISOString(), expectedStart.toISOString());
  assert.deepEqual(queries.workouts.include, { sets: { include: { exercise: true } } });
});

test("GET analytics summary defaults to 30 days and caps the maximum at 90", async t => {
  await t.test("uses the default window when days is omitted", async () => {
    let query;
    const prisma = {
      dailyLog: { findMany: async args => { query = args; return []; } },
      workoutSession: { findMany: async () => [] }
    };
    const expectedStart = new Date();
    expectedStart.setUTCHours(0, 0, 0, 0);
    expectedStart.setUTCDate(expectedStart.getUTCDate() - 29);

    await withAnalyticsApi(prisma, async baseUrl => {
      const response = await fetch(baseUrl + "/api/analytics/summary");
      assert.equal(response.status, 200);
      assert.equal((await response.json()).periodDays, 30);
    });

    assert.equal(query.where.date.gte.toISOString(), expectedStart.toISOString());
  });

  await t.test("caps oversized requests at 90 days", async () => {
    let query;
    const prisma = {
      dailyLog: { findMany: async args => { query = args; return []; } },
      workoutSession: { findMany: async () => [] }
    };
    const expectedStart = new Date();
    expectedStart.setUTCHours(0, 0, 0, 0);
    expectedStart.setUTCDate(expectedStart.getUTCDate() - 89);

    await withAnalyticsApi(prisma, async baseUrl => {
      const response = await fetch(baseUrl + "/api/analytics/summary?days=3650");
      assert.equal(response.status, 200);
      assert.equal((await response.json()).periodDays, 90);
    });

    assert.equal(query.where.date.gte.toISOString(), expectedStart.toISOString());
  });
});
