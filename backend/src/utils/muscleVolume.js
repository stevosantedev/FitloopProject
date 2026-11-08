/**
 * Convert completed workout sets into per-muscle training-volume summaries.
 *
 * The method is intentionally explicit: a primary muscle contributes one
 * effective set and a secondary muscle contributes half a set. This is a
 * product-level estimate for comparing logged activity, not a validated
 * measure of muscle stimulus, adaptation or recovery.
 */
  // A map lets several exercises contribute to one canonical muscle summary.
export function calculateMuscleVolume(sets) {
  const totals = new Map();

  // The caller supplies eligible completed sets; this utility handles attribution, not eligibility.
  for (const set of sets) {
    const trainedAt = new Date(set.session.startedAt);

    // One exercise may map to several muscles, so each set contributes to every
    // linked muscle with a different weight for primary and secondary roles.
    for (const link of set.exercise.muscles) {
      // Canonical slugs prevent display-name differences from splitting totals.
      const slug = link.muscle.slug;
      const current = totals.get(slug) ?? {
        muscle: link.muscle,
        effectiveSets: 0,
        primarySets: 0,
        secondarySets: 0,
        lastTrainedAt: null
      };

      // Keep primary and secondary counts separate. Half-set weighting is a product heuristic.
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
      // Store the aggregate after each link so later exercises build on this total.
      totals.set(slug, current);
    }
  }

  return totals;
}
