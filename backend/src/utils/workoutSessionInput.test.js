import test from "node:test";
import assert from "node:assert/strict";
import { sessionInput } from "./workoutSessionInput.js";

const makeSet = (exerciseId, setNumber, overrides = {}) => ({
  exerciseId,
  setNumber,
  reps: 10,
  completed: true,
  ...overrides
});

// Set numbers restart for each movement; they are not unique across the whole workout.
test("accepts multiple exercises with their own set numbering", () => {
  const result = sessionInput.safeParse({
    sets: [makeSet("squat", 1), makeSet("squat", 2), makeSet("press", 1)]
  });

  assert.equal(result.success, true);
});

// Skipped sets are retained for an honest session record even though they do not count as completed work.
test("accepts incomplete rows so skipped sets can remain in the session history", () => {
  const result = sessionInput.safeParse({
    sets: [makeSet("squat", 1), makeSet("squat", 2, { completed: false })]
  });

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.sets[1].completed, false);
});

// A saved workout needs at least one row so empty submissions cannot create misleading history.
test("rejects a session with no set rows", () => {
  assert.equal(sessionInput.safeParse({ sets: [] }).success, false);
});

// Duplicate numbering within one exercise would make set history ambiguous.
test("rejects duplicate set numbers within one exercise", () => {
  const result = sessionInput.safeParse({
    sets: [makeSet("squat", 1), makeSet("squat", 1)]
  });

  assert.equal(result.success, false);
});

// Each exercise owns its own numbering sequence, so two first sets are valid.
test("allows the same set number for different exercises", () => {
  const result = sessionInput.safeParse({
    sets: [makeSet("squat", 1), makeSet("press", 1)]
  });

  assert.equal(result.success, true);
});

// The per-exercise cap bounds payload size and keeps a single request from creating excessive rows.
test("rejects more than 50 rows for one exercise", () => {
  const result = sessionInput.safeParse({
    sets: Array.from({ length: 51 }, (_, index) => makeSet("squat", index + 1))
  });

  assert.equal(result.success, false);
});

// Numeric bounds prevent impossible values and protect calculations that consume saved sets.
test("rejects values outside the supported rep and load bounds", () => {
  assert.equal(sessionInput.safeParse({ sets: [makeSet("squat", 1, { reps: 0 })] }).success, false);
  assert.equal(sessionInput.safeParse({ sets: [makeSet("squat", 1, { weightKg: -1 })] }).success, false);
});

// A session containing only skipped sets is not treated as a completed workout.
test("rejects a workout when every set is incomplete", () => {
  const result = sessionInput.safeParse({
    sets: [makeSet("squat", 1, { completed: false })]
  });

  assert.equal(result.success, false);
});


// The client key lets a retry find the original session instead of creating a duplicate.
test("accepts a valid client request ID for offline sync", () => {
  const result = sessionInput.safeParse({
    clientRequestId: "b8a9d47d-f7d0-4b5f-9f58-43e6b0f7b2e2",
    sets: [makeSet("squat", 1)]
  });
  assert.equal(result.success, true);
});

// Restricting the key format keeps idempotency lookups predictable and avoids arbitrary identifiers.
test("rejects malformed client request IDs", () => {
  const result = sessionInput.safeParse({
    clientRequestId: "not-a-uuid",
    sets: [makeSet("squat", 1)]
  });
  assert.equal(result.success, false);
});
