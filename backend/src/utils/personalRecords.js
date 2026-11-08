/**
 * Extract simple, auditable personal records from completed set logs.
 * External load records exclude null/zero loads so bodyweight work is not
 * presented as a fabricated kilogram value. Rep and set-volume records remain
 * available for every movement.
 *
 * This utility receives the completed-set selection from its caller. It does
 * not query the database or decide which account's records are visible.
 */
export function calculatePersonalRecords(sets) {
  // One accumulator per exercise prevents unrelated movements competing for a record.
  const records = new Map();

  // Planned and abandoned sets are kept in history, but they are not achievements.
  for (const set of sets) {
    if (!set.completed) continue;

    // Skip malformed relation data rather than creating a record without a stable exercise identity.
    const exercise = set.exercise;
    if (!exercise?.id) continue;

    // A missing timestamp does not invalidate a measurement, but cannot win a date tie-break.
    const date = set.session?.startedAt ?? null;

    // Initialise all record types together so every exercise has the same response shape.
    const current = records.get(exercise.id) ?? {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      heaviestLoad: null,
      mostReps: null,
      highestSetVolume: null
    };

    // Store the measured value with its source session. Ties prefer the newer session
    // when both dates are available, making repeated equal performances deterministic.
    const candidate = (value, previous) => {
      const isNewer = date && (!previous?.date || new Date(date) > new Date(previous.date));
      if (!previous || value > previous.value || (value === previous.value && isNewer)) {
        return { value, date, sessionId: set.session?.id ?? null };
      }
      return previous;
    };

    // External load records exclude zero and missing loads. A bodyweight exercise
    // should not appear to have a kilogram record of zero.
    if (Number.isFinite(set.weightKg) && set.weightKg > 0) {
      current.heaviestLoad = candidate(set.weightKg, current.heaviestLoad);
    }

    // Repetition records still apply to bodyweight movements, where external load may be unknown.
    if (Number.isFinite(set.reps) && set.reps > 0) {
      current.mostReps = candidate(set.reps, current.mostReps);

      // Set volume requires both a valid rep count and a positive external load.
      // Bodyweight volume is left unknown rather than inventing a kilogram figure.
      if (Number.isFinite(set.weightKg) && set.weightKg > 0) {
        const volume = set.reps * set.weightKg;
        current.highestSetVolume = candidate(volume, current.highestSetVolume);
      }
    }

    // Save the updated record after evaluating all metrics for this set.
    records.set(exercise.id, current);
  }

  // Sort once at the boundary so API output is stable regardless of input set order.
  return [...records.values()].sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
}
