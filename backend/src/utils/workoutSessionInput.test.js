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

test("accepts multiple exercises with their own set numbering", () => {
  const result = sessionInput.safeParse({
    sets: [makeSet("squat", 1), makeSet("squat", 2), makeSet("press", 1)]
  });

  assert.equal(result.success, true);
});

test("accepts incomplete rows so skipped sets can remain in the session history", () => {
  const result = sessionInput.safeParse({
    sets: [makeSet("squat", 1, { completed: false })]
  });

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.sets[0].completed, false);
});

test("rejects a session with no set rows", () => {
  assert.equal(sessionInput.safeParse({ sets: [] }).success, false);
});

test("rejects duplicate set numbers within one exercise", () => {
  const result = sessionInput.safeParse({
    sets: [makeSet("squat", 1), makeSet("squat", 1)]
  });

  assert.equal(result.success, false);
});

test("allows the same set number for different exercises", () => {
  const result = sessionInput.safeParse({
    sets: [makeSet("squat", 1), makeSet("press", 1)]
  });

  assert.equal(result.success, true);
});

test("rejects more than 50 rows for one exercise", () => {
  const result = sessionInput.safeParse({
    sets: Array.from({ length: 51 }, (_, index) => makeSet("squat", index + 1))
  });

  assert.equal(result.success, false);
});

test("rejects values outside the supported rep and load bounds", () => {
  assert.equal(sessionInput.safeParse({ sets: [makeSet("squat", 1, { reps: 0 })] }).success, false);
  assert.equal(sessionInput.safeParse({ sets: [makeSet("squat", 1, { weightKg: -1 })] }).success, false);
});
