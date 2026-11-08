import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { createWorkoutRouter } from "./workouts.js";
import { buildProgressionSuggestions } from "../utils/progressionSuggestions.js";

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
    trainingPlan: { findMany: async () => [], findFirst: async () => null, create: async args => ({ id: "plan-a", ...args.data }), update: async args => ({ id: args.where.id, ...args.data }), deleteMany: async () => ({ count: 0 }), ...overrides.trainingPlan },
    trainingPlanDay: { count: async () => 0, ...overrides.trainingPlanDay },
    workoutSession: { findMany: async () => [], findFirst: async () => null, create: async args => ({ id: "session-a", ...args.data }), ...overrides.workoutSession },
    workoutSet: { findMany: async () => [], ...overrides.workoutSet },
    muscle: { findMany: async () => [], ...overrides.muscle }
  };
}

test("GET exercises returns technique and coaching fields with muscle links", async () => {
  let query;
  const prisma = makePrisma({
    exercise: {
      findMany: async args => {
        query = args;
        return [{
          id: "squat",
          name: "Goblet squat",
          description: "A dumbbell squat variation.",
          instructions: ["Hold the dumbbell at chest height."],
          coachingCues: ["Keep the whole foot grounded."],
          equipmentAlternatives: ["Kettlebell"],
          muscles: [{ role: "PRIMARY", muscle: { name: "Quadriceps", slug: "quadriceps" } }]
        }];
      }
    }
  });

  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/exercises");
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.exercises[0].description, "A dumbbell squat variation.");
    assert.deepEqual(data.exercises[0].instructions, ["Hold the dumbbell at chest height."]);
    assert.equal(data.exercises[0].muscles[0].muscle.slug, "quadriceps");
  });

  assert.deepEqual(query.include, {
    muscles: { include: { muscle: true }, orderBy: { role: "asc" } }
  });
  assert.equal(query.where.AND[0].OR[0].isCustom, false);
  assert.deepEqual(query.orderBy, [{ muscleGroup: "asc" }, { name: "asc" }]);
});

test("GET personal records scopes completed sets to the authenticated account", async () => {
  let query;
  const prisma = makePrisma({
    workoutSet: {
      findMany: async args => {
        query = args;
        return [{
          completed: true,
          reps: 8,
          weightKg: 70,
          exercise: { id: "bench", name: "Bench press" },
          session: { id: "session-a", startedAt: new Date("2026-10-01T10:00:00.000Z") }
        }];
      }
    }
  });

  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/personal-records");
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.records[0].exerciseName, "Bench press");
    assert.equal(data.records[0].heaviestLoad.value, 70);
  });

  assert.deepEqual(query.where, { completed: true, session: { userId: "user-a" } });
  assert.deepEqual(query.include.exercise.select, { id: true, name: true });
});

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
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deleted: true });
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


test("POST sessions returns the original session when an offline request is retried", async () => {
  let savedSession = null;
  let writes = 0;
  const requestId = "b8a9d47d-f7d0-4b5f-9f58-43e6b0f7b2e2";
  const prisma = makePrisma({
    exercise: { findMany: async () => [{ id: "bench" }] },
    workoutSession: {
      findFirst: async () => savedSession,
      create: async args => {
        writes += 1;
        savedSession = { id: "session-once", ...args.data };
        return savedSession;
      }
    }
  });

  await withWorkoutApi(prisma, async baseUrl => {
    const submit = () => fetch(baseUrl + "/api/workouts/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientRequestId: requestId,
        sets: [{ exerciseId: "bench", setNumber: 1, reps: 8 }]
      })
    });
    const first = await submit();
    const retry = await submit();
    assert.equal(first.status, 201);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).session.id, "session-once");
  });

  assert.equal(writes, 1);
  assert.equal(savedSession.clientRequestId, requestId);
});

test("POST sessions handles simultaneous offline retries with the unique database key", async () => {
  let lookupCount = 0;
  let savedSession;
  const requestId = "cd8cc63e-3f65-44f5-98d4-2a3cc56d75a8";
  const prisma = makePrisma({
    exercise: { findMany: async () => [{ id: "bench" }] },
    workoutSession: {
      findFirst: async () => {
        lookupCount += 1;
        return lookupCount === 1 ? null : savedSession;
      },
      create: async args => {
        savedSession = { id: "session-from-other-tab", ...args.data };
        const conflict = new Error("Unique request key already exists.");
        conflict.code = "P2002";
        throw conflict;
      }
    }
  });

  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientRequestId: requestId,
        sets: [{ exerciseId: "bench", setNumber: 1, reps: 8 }]
      })
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).session.id, "session-from-other-tab");
  });
  assert.equal(lookupCount, 2);
});

test("GET training plans returns only the authenticated account's programmes", async () => {
  let query;
  const prisma = makePrisma({ trainingPlan: { findMany: async args => { query = args; return [{ id: "plan-a", days: [] }]; } } });
  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/training-plans");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { plans: [{ id: "plan-a", days: [] }] });
  });
  assert.deepEqual(query.where, { userId: "user-a" });
  assert.ok(query.include.days.include.routine.include.exercises);
});

test("POST training plans creates ordered days from routines owned by the caller", async () => {
  let routineLookup; let createArgs;
  const prisma = makePrisma({
    workoutRoutine: { findMany: async args => { routineLookup = args; return [{ id: "routine-a" }, { id: "routine-b" }]; } },
    trainingPlan: { create: async args => { createArgs = args; return { id: "plan-a", ...args.data }; } }
  });
  const payload = { name: "Three day strength", goal: "strength", daysPerWeek: 2, experience: "beginner", equipment: "gym",
    days: [{ dayNumber: 1, label: "Full body A", routineId: "routine-a" }, { dayNumber: 2, label: "Full body B", routineId: "routine-b" }] };
  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/training-plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).plan.id, "plan-a");
  });
  assert.deepEqual(routineLookup.where, { id: { in: ["routine-a", "routine-b"] }, userId: "user-a" });
  assert.equal(createArgs.data.userId, "user-a");
  assert.equal(createArgs.data.days.create.length, 2);
  assert.deepEqual(createArgs.data.days.create.map(day => day.dayNumber), [1, 2]);
});

test("POST training plans atomically creates each day routine from owned catalogue exercises", async () => {
  let exerciseLookup; let createArgs;
  const prisma = makePrisma({
    exercise: { findMany: async args => { exerciseLookup = args; return [{ id: "bench" }, { id: "row" }]; } },
    trainingPlan: { create: async args => { createArgs = args; return { id: "plan-inline", ...args.data }; } }
  });
  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/training-plans", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Two day programme", goal: "general", daysPerWeek: 2, experience: "beginner", equipment: "gym",
        days: [
          { dayNumber: 1, label: "Day A", routineName: "Programme · Day A", exercises: [{ exerciseId: "bench" }, { exerciseId: "row" }] },
          { dayNumber: 2, label: "Day B", routineName: "Programme · Day B", exercises: [{ exerciseId: "row" }, { exerciseId: "bench" }] }
        ]
      })
    });
    assert.equal(response.status, 201);
  });
  assert.deepEqual(exerciseLookup.where.OR, [{ isCustom: false }, { ownerId: "user-a" }]);
  assert.equal(createArgs.data.days.create.length, 2);
  assert.equal(createArgs.data.days.create[0].routine.create.user.connect.id, "user-a");
  assert.deepEqual(createArgs.data.days.create[0].routine.create.exercises.create.map(item => item.sortOrder), [0, 1]);
  assert.equal(createArgs.data.days.create[0].routine.create.exercises.create[0].exercise.connect.id, "bench");
});

test("POST training plans rejects private exercises owned by another account", async () => {
  let writes = 0;
  const prisma = makePrisma({ exercise: { findMany: async () => [] }, trainingPlan: { create: async () => { writes += 1; return {}; } } });
  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/training-plans", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Private exercise plan", goal: "general", daysPerWeek: 2, experience: "beginner", equipment: "gym",
        days: [
          { dayNumber: 1, label: "Day A", routineName: "Day A", exercises: [{ exerciseId: "other-user-private-id" }] },
          { dayNumber: 2, label: "Day B", routineName: "Day B", exercises: [{ exerciseId: "other-user-private-id" }] }
        ]
      })
    });
    assert.equal(response.status, 400);
  });
  assert.equal(writes, 0);
});

test("POST training plans rejects routines owned by another account", async () => {
  let writes = 0;
  const prisma = makePrisma({
    workoutRoutine: { findMany: async () => [{ id: "routine-a" }] },
    trainingPlan: { create: async () => { writes += 1; return {}; } }
  });
  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/training-plans", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Private plan", goal: "general", daysPerWeek: 2, experience: "beginner", equipment: "gym",
        days: [{ dayNumber: 1, label: "Day 1", routineId: "routine-a" }, { dayNumber: 2, label: "Day 2", routineId: "other-user-routine" }] }) });
    assert.equal(response.status, 400);
  });
  assert.equal(writes, 0);
});

test("POST training plans rejects a mismatch between available days and plan days", async () => {
  let lookups = 0;
  const prisma = makePrisma({ workoutRoutine: { findMany: async () => { lookups += 1; return []; } } });
  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/training-plans", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Incomplete plan", goal: "general", daysPerWeek: 3, experience: "beginner", equipment: "gym",
        days: [{ dayNumber: 1, label: "Day 1", routineId: "routine-a" }, { dayNumber: 2, label: "Day 2", routineId: "routine-b" }] }) });
    assert.equal(response.status, 400);
  });
  assert.equal(lookups, 0);
});

test("PUT training plans updates only an owned plan and replaces its days", async () => {
  let lookup; let update;
  const prisma = makePrisma({
    trainingPlan: { findFirst: async args => { lookup = args; return { id: "plan-a" }; }, update: async args => { update = args; return { id: "plan-a", ...args.data }; } },
    workoutRoutine: { findMany: async () => [{ id: "routine-a" }, { id: "routine-b" }] }
  });
  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/training-plans/plan-a", { method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Updated plan", goal: "muscle", daysPerWeek: 2, experience: "intermediate", equipment: "dumbbells",
        days: [{ dayNumber: 1, label: "Upper", routineId: "routine-a" }, { dayNumber: 2, label: "Lower", routineId: "routine-b" }] }) });
    assert.equal(response.status, 200);
  });
  assert.deepEqual(lookup.where, { id: "plan-a", userId: "user-a" });
  assert.deepEqual(update.data.days.deleteMany, {});
  assert.equal(update.data.days.create.length, 2);
});

test("PUT training plans does not disclose a plan owned by another account", async () => {
  let routineLookups = 0;
  const prisma = makePrisma({ trainingPlan: { findFirst: async () => null }, workoutRoutine: { findMany: async () => { routineLookups += 1; return []; } } });
  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/training-plans/other-plan", { method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Attempted edit", goal: "general", daysPerWeek: 2, experience: "beginner", equipment: "gym",
        days: [{ dayNumber: 1, label: "Day 1", routineId: "routine-a" }, { dayNumber: 2, label: "Day 2", routineId: "routine-b" }] }) });
    assert.equal(response.status, 404);
  });
  assert.equal(routineLookups, 0);
});

test("DELETE training plans scopes deletion to the authenticated account", async () => {
  let deletion;
  const prisma = makePrisma({ trainingPlan: { deleteMany: async args => { deletion = args; return { count: 1 }; } } });
  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/training-plans/plan-a", { method: "DELETE" });
    assert.equal(response.status, 200);
  });
  assert.deepEqual(deletion.where, { id: "plan-a", userId: "user-a" });
});

test("DELETE training plans returns not found for an unowned plan", async () => {
  const prisma = makePrisma({ trainingPlan: { deleteMany: async () => ({ count: 0 }) } });
  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/training-plans/missing", { method: "DELETE" });
    assert.equal(response.status, 404);
  });
});

test("DELETE routines prevents removing a routine referenced by the caller's plan", async () => {
  let routineDeletes = 0;
  const prisma = makePrisma({
    trainingPlanDay: { count: async args => {
      assert.deepEqual(args.where, { routineId: "routine-a", plan: { is: { userId: "user-a" } } });
      return 1;
    } },
    workoutRoutine: { deleteMany: async () => { routineDeletes += 1; return { count: 1 }; } }
  });
  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/routines/routine-a", { method: "DELETE" });
    assert.equal(response.status, 409);
  });
  assert.equal(routineDeletes, 0);
});


test("progression suggestions compare recent completed sessions and ignore incomplete sets", () => {
  const suggestions = buildProgressionSuggestions([
    { completed: true, reps: 10, weightKg: 20, exercise: { id: "squat", name: "Goblet squat" }, session: { id: "s3", startedAt: new Date("2026-11-08T10:00:00Z") } },
    { completed: true, reps: 8, weightKg: 20, exercise: { id: "squat", name: "Goblet squat" }, session: { id: "s2", startedAt: new Date("2026-11-06T10:00:00Z") } },
    { completed: true, reps: 12, weightKg: 18, exercise: { id: "squat", name: "Goblet squat" }, session: { id: "s1", startedAt: new Date("2026-11-04T10:00:00Z") } },
    { completed: false, reps: 15, weightKg: 30, exercise: { id: "squat", name: "Goblet squat" }, session: { id: "s4", startedAt: new Date("2026-11-09T10:00:00Z") } }
  ]);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].recommendation, "consider_small_increase");
  assert.equal(suggestions[0].latest.reps, 10);
  assert.equal(suggestions[0].previous.reps, 8);
  assert.equal(suggestions[0].recentSessions.length, 3);
  assert.deepEqual(suggestions[0].recentSessions.map(session => session.reps), [10, 8, 12]);
});

test("bodyweight progression encourages controlled reps without suggesting an external load increase", () => {
  const suggestions = buildProgressionSuggestions([
    { completed: true, reps: 12, weightKg: null, exercise: { id: "push", name: "Push-up" }, session: { id: "new", startedAt: new Date("2026-11-08T10:00:00Z") } },
    { completed: true, reps: 10, weightKg: null, exercise: { id: "push", name: "Push-up" }, session: { id: "old", startedAt: new Date("2026-11-06T10:00:00Z") } }
  ]);
  assert.equal(suggestions[0].recommendation, "maintain");
  assert.match(suggestions[0].reason, /bodyweight reps/i);
  assert.match(suggestions[0].reason, /no external load increase/i);
});

test("progression suggestions omit exercises without two completed sessions", () => {
  assert.deepEqual(buildProgressionSuggestions([
    { completed: true, reps: 8, weightKg: null, exercise: { id: "push", name: "Push-up" }, session: { id: "only", startedAt: new Date("2026-11-08T10:00:00Z") } }
  ]), []);
});

test("GET progression suggestions scopes completed sets to the authenticated account", async () => {
  let query;
  const prisma = makePrisma({ workoutSet: { findMany: async args => { query = args; return []; } } });
  await withWorkoutApi(prisma, async baseUrl => {
    const response = await fetch(baseUrl + "/api/workouts/progression-suggestions");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { suggestions: [] });
  });
  assert.deepEqual(query.where, { completed: true, session: { userId: "user-a" } });
  assert.equal(query.take, 500);
});
