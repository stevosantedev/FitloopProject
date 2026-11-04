import test from "node:test";
import assert from "node:assert/strict";
import { calculatePersonalRecords } from "./personalRecords.js";

const set = (overrides = {}) => ({
  completed: true,
  reps: 8,
  weightKg: 50,
  exercise: { id: "bench", name: "Bench press" },
  session: { id: "session-1", startedAt: "2026-10-01T10:00:00.000Z" },
  ...overrides
});

test("personal records use completed sets and keep the heaviest logged load", () => {
  const records = calculatePersonalRecords([
    set(),
    set({ reps: 6, weightKg: 60, session: { id: "session-2", startedAt: "2026-10-03T10:00:00.000Z" } }),
    set({ reps: 12, weightKg: 40, completed: false })
  ]);

  assert.equal(records.length, 1);
  assert.deepEqual(records[0].heaviestLoad, {
    value: 60, date: "2026-10-03T10:00:00.000Z", sessionId: "session-2"
  });
  assert.equal(records[0].mostReps.value, 8);
});

test("bodyweight movements do not receive an external-load record", () => {
  const records = calculatePersonalRecords([
    set({ exercise: { id: "pull-up", name: "Pull-up" }, weightKg: null, reps: 12 })
  ]);
  assert.equal(records[0].heaviestLoad, null);
  assert.equal(records[0].mostReps.value, 12);
});

test("equal records prefer the most recent logged session", () => {
  const records = calculatePersonalRecords([
    set({ session: { id: "old", startedAt: "2026-09-01T10:00:00.000Z" } }),
    set({ session: { id: "new", startedAt: "2026-10-01T10:00:00.000Z" } })
  ]);
  assert.equal(records[0].heaviestLoad.sessionId, "new");
});

test("incomplete sets and invalid exercise rows are ignored", () => {
  assert.deepEqual(calculatePersonalRecords([
    set({ completed: false }),
    set({ exercise: null })
  ]), []);
});
