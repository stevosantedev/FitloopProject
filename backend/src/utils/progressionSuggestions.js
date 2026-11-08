/**
 * Compare the best completed set from the two most recent sessions per exercise.
 * Suggestions are deliberately conservative: the user decides whether to change load.
 */
export function buildProgressionSuggestions(sets) {
  const byExercise = new Map();
  for (const set of sets) {
    if (!set.completed || !set.exercise?.id || !set.session?.startedAt) continue;
    const group = byExercise.get(set.exercise.id) ?? { exerciseId: set.exercise.id, exerciseName: set.exercise.name, sessions: new Map() };
    const session = group.sessions.get(set.session.id) ?? { date: set.session.startedAt, sets: [] };
    session.sets.push(set);
    group.sessions.set(set.session.id, session);
    byExercise.set(set.exercise.id, group);
  }
  const suggestions = [];
  for (const group of byExercise.values()) {
    const recent = [...group.sessions.values()].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
    if (recent.length < 2) continue;
    const best = session => session.sets.reduce((winner, set) => {
      const score = (set.weightKg ?? 0) * 100000 + set.reps;
      return !winner || score > winner.score ? { score, reps: set.reps, weightKg: set.weightKg ?? null } : winner;
    }, null);
    const recentSessions = recent.map(session => ({ ...best(session), date: new Date(session.date).toISOString() }));
    const latest = recentSessions[0], previous = recentSessions[1];
    let recommendation, reason;
    if (latest.weightKg != null && previous.weightKg != null && latest.weightKg > previous.weightKg && latest.reps >= previous.reps) {
      recommendation = "maintain";
      reason = "You used a heavier load while matching or exceeding your previous reps. Repeat it with controlled technique before increasing again.";
    } else if (latest.weightKg == null && previous.weightKg == null && latest.reps >= previous.reps + 2) {
      // Bodyweight progress is better expressed as controlled rep development, not an assumed load increase.
      recommendation = "maintain";
      reason = "You completed at least two more bodyweight reps. Keep building controlled reps or use a harder variation when the movement feels consistently manageable; no external load increase is implied.";
    } else if (latest.weightKg === previous.weightKg && latest.reps >= previous.reps + 2) {
      recommendation = "consider_small_increase";
      reason = "You completed at least two more reps at the same load. If the sets felt controlled, consider the smallest available load increase next time.";
    } else if (latest.reps < previous.reps || (latest.weightKg != null && previous.weightKg != null && latest.weightKg < previous.weightKg)) {
      recommendation = "repeat_or_reduce";
      reason = "Your latest best set was below the previous session. Consider repeating the load or reducing it if technique or recovery felt affected.";
    } else {
      recommendation = "maintain";
      reason = "Your recent performance is broadly unchanged. Keep the load steady and focus on consistent, controlled reps.";
    }
    suggestions.push({ exerciseId: group.exerciseId, exerciseName: group.exerciseName, recommendation, reason,
      latest: { reps: latest.reps, weightKg: latest.weightKg, date: latest.date },
      previous: { reps: previous.reps, weightKg: previous.weightKg, date: previous.date },
      recentSessions });
  }
  return suggestions.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
}
