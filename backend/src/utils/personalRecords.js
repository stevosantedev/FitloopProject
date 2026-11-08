/**
 * Extract simple, auditable personal records from completed set logs.
 * External load records exclude null/zero loads so bodyweight work is not
 * presented as a fabricated kilogram value. Rep and set-volume records remain
 * available for every movement.
 */
  // One accumulator per exercise prevents unrelated movements competing for a record.
export function calculatePersonalRecords(sets) {
  const records = new Map();

  // Only completed work contributes; planned or abandoned sets are not achievements.
  for (const set of sets) {
    if (!set.completed) continue;
    const exercise = set.exercise;
    if (!exercise?.id) continue;

    // A missing timestamp does not invalidate a measurement, but cannot win a date tie-break.
    const date = set.session?.startedAt ?? null;
    const current = records.get(exercise.id) ?? {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      heaviestLoad: null,
      mostReps: null,
      highestSetVolume: null
    };

    // The candidate is a numeric measurement; the stored record wraps it with
    // its session metadata. Compare the number itself, not a nonexistent
    // nested value property, so stronger results can replace older records.
    const candidate = (value, previous) => {
      const isNewer = date && (!previous?.date || new Date(date) > new Date(previous.date));
      if (!previous || value > previous.value || (value === previous.value && isNewer)) {
        return { value, date, sessionId: set.session?.id ?? null };
      }
      return previous;
    };

    // A zero or absent external load is not a kilogram record for bodyweight movements.
    if (Number.isFinite(set.weightKg) && set.weightKg > 0) {
      current.heaviestLoad    if (Number.isFinite(set.weightKg) && set.weightKg > 0) {
      current.heaviestLoad = candidate(set.weightKg, current.heaviestLoad);
    }
    // Rep records still apply to bodyweight work, where external load may be unknown.
    if (Number.isFinite(set.reps) && set.reps > 0) {
    if (Number.isFinite(set.reps) && set.reps > 0) {
      current.mostReps = candidate(set.reps, current.mostReps);
      // Set volume requires both a valid rep count and a positive external load.
      if (Number.isFinite(set.weightKg) && set.weightKg > 0) {
      if (Number.isFinite(set.weightKg) && set.weightKg > 0) {
        const volume = set.reps * set.weightKg;
        current.highestSetVolume = candidate(volume, current.highestSetVolume);
      }
    }

    records.set(exercise.id, current);
  }

  // Sort once at the boundary so API output is stable regardless of input set order.
  return [...records.values()]  return [...records.values()].sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
}
