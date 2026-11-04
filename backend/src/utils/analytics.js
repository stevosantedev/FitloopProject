// These pure functions turn database records into simple summaries that are easy to test.
export function summariseDailyLogs(logs) {
  // Ignore missing measurements rather than treating an empty entry as zero.
  const average = (field) => {
    const values = logs.map(log => log[field]).filter(value => Number.isFinite(value));
    if (values.length === 0) return null;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10;
  };

  return {
    daysLogged: logs.length,
    averageSleepMinutes: average("sleepMinutes"),
    averageSteps: average("steps"),
    averageMood: average("mood"),
    averageFocusMinutes: average("focusMinutes")
  };
}

export function summariseWorkoutSessions(sessions) {
  // Count completed sets by muscle group and calculate weighted volume where weight was recorded.
  const byMuscleGroup = {};
  let completedSets = 0;
  let totalVolumeKg = 0;

  for (const session of sessions) {
    for (const set of session.sets) {
      if (!set.completed) continue;
      completedSets += 1;
      const group = set.exercise?.muscleGroup || "Other";
      byMuscleGroup[group] = (byMuscleGroup[group] ?? 0) + 1;

      // Bodyweight sets still count as completed work, but do not add invented kilogram values.
      if (Number.isFinite(set.weightKg)) totalVolumeKg += set.reps * set.weightKg;
    }
  }

  return {
    sessionsLogged: sessions.length,
    completedSets,
    totalVolumeKg: Math.round(totalVolumeKg * 10) / 10,
    byMuscleGroup
  };
}
