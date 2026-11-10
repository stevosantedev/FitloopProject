import test from "node:test";
import assert from "node:assert/strict";
import { summariseDailyLogs, summariseWorkoutSessions } from "./analytics.js";

// The average uses only recorded values; an absent check-in is not evidence of zero activity.
test("daily averages ignore fields that were not logged", () => {
  // Missing values should not pull a person's average down to zero.
  const result = summariseDailyLogs([
    { sleepMinutes: 420, steps: 5000, activityMinutes: 30, mood: 4, focusMinutes: 60 },
    { sleepMinutes: null, steps: 7000, activityMinutes: null, mood: 2, focusMinutes: null },
    { sleepMinutes: 480, steps: undefined, activityMinutes: 60, mood: 5, focusMinutes: 120 }
  ]);

  assert.equal(result.daysLogged, 3);
  assert.equal(result.averageSleepMinutes, 450);
  assert.equal(result.averageSteps, 6000);
  assert.equal(result.averageActivityMinutes, 45);
  assert.equal(result.averageMood, 3.7);
  assert.equal(result.averageFocusMinutes, 90);
});

// Null preserves the distinction between an untracked metric and a measured zero.
test("daily averages return null when no measurements exist", () => {
  // Null makes the difference between no data and a real zero measurement clear.
  const result = summariseDailyLogs([{ sleepMinutes: null, steps: undefined }]);
  assert.equal(result.averageSleepMinutes, null);
  assert.equal(result.averageSteps, null);
  assert.equal(result.averageActivityMinutes, null);
});

// Completed bodyweight sets count as work, while unknown load is excluded from kilogram volume.
test("workout summary counts completed sets and known weighted volume", () => {
  // Incomplete sets are ignored, and bodyweight work counts without a made-up weight.
  const result = summariseWorkoutSessions([{
    sets: [
      { completed: true, reps: 10, weightKg: 20, exercise: { muscleGroup: "Chest" } },
      { completed: true, reps: 8, weightKg: null, exercise: { muscleGroup: "Chest" } },
      { completed: false, reps: 12, weightKg: 10, exercise: { muscleGroup: "Legs" } }
    ]
  }]);

  assert.equal(result.sessionsLogged, 1);
  assert.equal(result.completedSets, 2);
  assert.equal(result.totalVolumeKg, 200);
  assert.deepEqual(result.byMuscleGroup, { Chest: 2 });
});
