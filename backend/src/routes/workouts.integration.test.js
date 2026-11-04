import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { createWorkoutRouter } from "./workouts.js";

/**
 * Start a real HTTP listener around the router while replacing only the database.
 * This exercises Express routing, JSON parsing, Zod validation and response codes
 * without making the test suite depend on a local PostgreSQL service.
 */
async function withWorkoutApi(prismaClient, run) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Mirrors the authenticated parent router: the ID is trusted server context.
    req.userId = "user-a";
    next();
  });
  app.use("/api/workouts", createWorkoutRouter(prismaClient));
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

function makePrisma(overrides = {}) {
  return {
    exercise: { findMany: async () => [], ...overrides.exercise },
    workoutRoutine: { findMany: async () => [], findFirst: async () => null, update: async args => ({ id: args.where.id, ...args.data }), deleteMany: async () => ({ count: 0 }), ...overrides.workoutRoutine },
    workoutSession: { findMany: async () => [], create: async args => ({ id: "session-a", ...args.data }), ...overrides.workoutSession },
    workoutSet: { findMany: async () => [], ...overrides.workoutSet },
    muscle: { findMany: async () => [], ...overrides.muscle }
  };
}

test("GET routines scopes the database query to the authenticated account", async () => {
  let query;
  const prisma = makePrisma({
    workoutRoutine: { findMany: async args => { query = args; return []; } }
  });

  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/routines");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { routines: [] });
  });

  assert.equal(query.where.userId, "user-a");
});

test("PUT routines updates only an owned routine and replaces its ordered exercises", async () => {
  let updateArgs;
  let lookupArgs;
  const prisma = makePrisma({
    workoutRoutine: {
      findFirst: async args => { lookupArgs = args; return { id: "routine-a" }; },
      update: async args => { updateArgs = args; return { id: "routine-a", name: args.data.name }; }
    },
    exercise: { findMany: async args => args.where.id.in.map(id => ({ id })) }
  });

  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/routines/routine-a", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Upper body", exercises: [{ exerciseId: "bench" }, { exerciseId: "row" }] })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { routine: { id: "routine-a", name: "Upper body" } });
  });

  assert.deepEqual(lookupArgs.where, { id: "routine-a", userId: "user-a" });
  assert.deepEqual(updateArgs.data.exercises.create.map(item => item.sortOrder), [0, 1]);
  assert.deepEqual(updateArgs.data.exercises.deleteMany, {});
});

test("PUT routines returns not found for a routine owned by another account", async () => {
  let exerciseLookups = 0;
  const prisma = makePrisma({
    workoutRoutine: { findFirst: async () => null },
    exercise: { findMany: async () => { exerciseLookups += 1; return []; } }
  });

  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/routines/other-routine", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Changed", exercises: [{ exerciseId: "bench" }] })
    });
    assert.equal(response.status, 404);
  });
  assert.equal(exerciseLookups, 0);
});

test("DELETE routines scopes deletion to the authenticated account", async () => {
  let deleteArgs;
  const prisma = makePrisma({
    workoutRoutine: { deleteMany: async args => { deleteArgs = args; return { count: 1 }; } }
  });

  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/routines/routine-a", { method: "DELETE" });
    assert.equal(response.status, 204);
  });
  assert.deepEqual(deleteArgs.where, { id: "routine-a", userId: "user-a" });
});

test("DELETE routines returns not found when no owned routine matches", async () => {
  const prisma = makePrisma({ workoutRoutine: { deleteMany: async () => ({ count: 0 }) } });
  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/routines/missing", { method: "DELETE" });
    assert.equal(response.status, 404);
  });
});

test("POST sessions creates a session and feed post for the authenticated account", async () => {
  let createArgs;
  const prisma = makePrisma({
    exercise: { findMany: async args => args.where.id.in.map(id => ({ id })) },
    workoutSession: { create: async args => { createArgs = args; return { id: "session-a" }; } }
  });

  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sets: [
          { exerciseId: "bench", setNumber: 1, reps: 8, weightKg: 60, completed: true },
          { exerciseId: "bench", setNumber: 2, reps: 6, weightKg: 65, completed: true },
          { exerciseId: "row", setNumber: 1, reps: 10, weightKg: 35, completed: false }
        ]
      })
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { session: { id: "session-a" } });
  });

  assert.equal(createArgs.data.userId, "user-a");
  assert.equal(createArgs.data.sets.create.length, 3);
  assert.equal(createArgs.data.sets.create[2].completed, false);
  assert.deepEqual(createArgs.data.post.create, { userId: "user-a", type: "workout" });
});

test("POST sessions rejects duplicate set numbers before querying or writing", async () => {
  let exerciseLookups = 0;
  let sessionWrites = 0;
  const prisma = makePrisma({
    exercise: { findMany: async () => { exerciseLookups += 1; return [{ id: "bench" }]; } },
    workoutSession: { create: async () => { sessionWrites += 1; return {}; } }
  });

  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sets: [
        { exerciseId: "bench", setNumber: 1, reps: 8 },
        { exerciseId: "bench", setNumber: 1, reps: 9 }
      ] })
    });
    assert.equal(response.status, 400);
  });

  assert.equal(exerciseLookups, 0);
  assert.equal(sessionWrites, 0);
});

test("POST sessions rejects exercise IDs absent from the catalogue", async () => {
  let sessionWrites = 0;
  const prisma = makePrisma({
    exercise: { findMany: async () => [] },
    workoutSession: { create: async () => { sessionWrites += 1; return {}; } }
  });

  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sets: [{ exerciseId: "missing", setNumber: 1, reps: 8 }] })
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /exercises do not exist/i);
  });

  assert.equal(sessionWrites, 0);
});

test("POST sessions rejects a routine owned by another account", async () => {
  let exerciseLookups = 0;
  const prisma = makePrisma({
    workoutRoutine: { findFirst: async () => null },
    exercise: { findMany: async () => { exerciseLookups += 1; return [{ id: "bench" }]; } }
  });

  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ routineId: "other-users-routine", sets: [{ exerciseId: "bench", setNumber: 1, reps: 8 }] })
    });
    assert.equal(response.status, 404);
  });

  assert.equal(exerciseLookups, 0);
});


test("POST sessions cannot use another account's private custom exercise", async () => {
  let lookup;
  let sessionWrites = 0;
  const prisma = makePrisma({
    exercise: { findMany: async args => { lookup = args; return []; } },
    workoutSession: { create: async () => { sessionWrites += 1; return {}; } }
  });

  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sets: [{ exerciseId: "private-custom-id", setNumber: 1, reps: 8 }] })
    });
    assert.equal(response.status, 400);
  });

  assert.deepEqual(lookup.where.OR, [{ isCustom: false }, { ownerId: "user-a" }]);
  assert.equal(sessionWrites, 0);
});

test("POST routines cannot link another account's private custom exercise", async () => {
  let lookup;
  let routineWrites = 0;
  const prisma = makePrisma({
    exercise: { findMany: async args => { lookup = args; return []; } },
    workoutRoutine: { create: async () => { routineWrites += 1; return {}; } }
  });

  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/routines", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Private movement test", exercises: [{ exerciseId: "private-custom-id", sortOrder: 0 }] })
    });
    assert.equal(response.status, 400);
  });

  assert.deepEqual(lookup.where.OR, [{ isCustom: false }, { ownerId: "user-a" }]);
  assert.equal(routineWrites, 0);
});


test("POST routines rejects duplicate exercises and positions before database access", async () => {
  let exerciseLookups = 0;
  let routineWrites = 0;
  const prisma = makePrisma({
    exercise: { findMany: async () => { exerciseLookups += 1; return [{ id: "bench" }]; } },
    workoutRoutine: { create: async () => { routineWrites += 1; return {}; } }
  });

  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/routines", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Duplicate entries", exercises: [
        { exerciseId: "bench", sortOrder: 0 },
        { exerciseId: "bench", sortOrder: 1 }
      ] })
    });
    assert.equal(response.status, 400);
  });

  assert.equal(exerciseLookups, 0);
  assert.equal(routineWrites, 0);
});


test("POST routines rejects repeated explicit positions", async () => {
  let exerciseLookups = 0;
  const prisma = makePrisma({
    exercise: { findMany: async () => { exerciseLookups += 1; return [{ id: "bench" }, { id: "row" }]; } }
  });

  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/routines", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Repeated positions", exercises: [
        { exerciseId: "bench", sortOrder: 0 },
        { exerciseId: "row", sortOrder: 0 }
      ] })
    });
    assert.equal(response.status, 400);
  });

  assert.equal(exerciseLookups, 0);
});
