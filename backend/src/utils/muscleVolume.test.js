import test from "node:test";
import assert from "node:assert/strict";
import { calculateMuscleVolume } from "./muscleVolume.js";

const muscle = slug => ({ slug, name: slug });

test("primary and secondary muscle links receive different set weights", () => {
  const chest = muscle("chest");
  const triceps = muscle("triceps");
  const totals = calculateMuscleVolume([{
    session: { startedAt: "2026-11-01T10:00:00.000Z" },
    exercise: { muscles: [
      { role: "PRIMARY", muscle: chest },
      { role: "SECONDARY", muscle: triceps }
    ] }
  }]);

  assert.equal(totals.get("chest").effectiveSets, 1);
  assert.equal(totals.get("chest").primarySets, 1);
  assert.equal(totals.get("triceps").effectiveSets, 0.5);
  assert.equal(totals.get("triceps").secondarySets, 1);
});

test("multiple sets accumulate and retain the latest training date", () => {
  const back = muscle("back");
  const totals = calculateMuscleVolume([
    { session: { startedAt: "2026-11-01T10:00:00.000Z" }, exercise: { muscles: [{ role: "PRIMARY", muscle: back }] } },
    { session: { startedAt: "2026-11-03T10:00:00.000Z" }, exercise: { muscles: [{ role: "PRIMARY", muscle: back }] } },
    { session: { startedAt: "2026-11-02T10:00:00.000Z" }, exercise: { muscles: [{ role: "SECONDARY", muscle: back }] } }
  ]);

  assert.equal(totals.get("back").effectiveSets, 2.5);
  assert.equal(totals.get("back").primarySets, 2);
  assert.equal(totals.get("back").secondarySets, 1);
  assert.equal(totals.get("back").lastTrainedAt.toISOString(), "2026-11-03T10:00:00.000Z");
});

test("an empty workout produces no muscle totals", () => {
  assert.equal(calculateMuscleVolume([]).size, 0);
});
