/**
 * Extract simple, auditable personal records from completed set logs.
 * External load records exclude null/zero loads so bodyweight work is not
 * presented as a fabricated kilogram value. Rep and set-volume records remain
 * available for every movement.
 */
export function calculatePersonalRecords(sets) {
  const records = new Map();

  for (const set of sets) {
    if (!set.completed) continue;
    const exercise = set.exercise;
    if (!exercise?.id) continue;

    const date = set.session?.startedAt ?? null;
    const current = records.get(exercise.id) ?? {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      heaviestLoad: null,
      mostReps: null,
      highestSetVolume: null
    };

    const candidate = (value, previous) => {
      if (!previous || value.value > previous.value ||
          (value.value === previous.value && date && (!previous.date || new Date(date) > new Date(previous.date)))) {
        return { value, date, sessionId: set.session?.id ?? null };
      }
      return previous;
    };

    if (Number.isFinite(set.weightKg) && set.weightKg > 0) {
      current.heaviestLoad = candidate(set.weightKg, current.heaviestLoad);
    }
    if (Number.isFinite(set.reps) && set.reps > 0) {
      current.mostReps = candidate(set.reps, current.mostReps);
      const volume = set.reps * (Number.isFinite(set.weightKg) && set.weightKg > 0 ? set.weightKg : 0);
      current.highestSetVolume = candidate(volume, current.highestSetVolume);
    }

    records.set(exercise.id, current);
  }

  return [...records.values()].sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
}
