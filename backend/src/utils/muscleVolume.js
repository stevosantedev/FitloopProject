/**
 * Convert completed workout sets into per-muscle training-volume summaries.
 *
 * The method is intentionally explicit: a primary muscle contributes one
 * effective set and a secondary muscle contributes half a set. This is a
 * product-level estimate for comparing logged activity, not a validated
 * measure of muscle stimulus, adaptation or recovery.
 */
export function calculateMuscleVolume(sets) {
  const totals = new Map();

  for (const set of sets) {
    const trainedAt = new Date(set.session.startedAt);

    // One exercise may map to several muscles, so each set contributes to every
    // linked muscle with a different weight for primary and secondary roles.
    for (const link of set.exercise.muscles) {
      const slug = link.muscle.slug;
      const current = totals.get(slug) ?? {
        muscle: link.muscle,
        effectiveSets: 0,
        primarySets: 0,
        secondarySets: 0,
        lastTrainedAt: null
      };

      if (link.role === "PRIMARY") {
        current.effectiveSets += 1;
        current.primarySets += 1;
      } else {
        current.effectiveSets += 0.5;
        current.secondarySets += 1;
      }

      // History may arrive newest-first or oldest-first; retain the latest date.
      if (!current.lastTrainedAt || trainedAt > current.lastTrainedAt) {
        current.lastTrainedAt = trainedAt;
      }
      totals.set(slug, current);
    }
  }

  return totals;
}
