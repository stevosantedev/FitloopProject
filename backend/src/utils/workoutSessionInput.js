/**
 * Validation contract for a workout session submitted by the browser.
 *
 * The schema keeps request-level rules outside the Express route so they can
 * be tested directly without a database or an HTTP server. The route still
 * checks that every exercise and optional routine belongs to an available record.
 */
import { z } from "zod";

// Enforce limits at the API boundary because callers can bypass browser form controls.
// Defaults let simpler clients omit optional metadata without creating partial records.
export const sessionInput = z.object({
  routineId: z.string().optional(),
  notes: z.string().max(500).optional(),
  clientRequestId: z.string().uuid().optional(),
  sets: z.array(z.object({
    exerciseId: z.string().min(1),
    setNumber: z.number().int().min(1).max(50),
    reps: z.number().int().min(1).max(500),
    weightKg: z.number().min(0).max(1000).optional(),
    completed: z.boolean().default(true),
    setType: z.enum(["working", "warmup", "drop", "failure", "rest_pause", "amrap"]).default("working"),
    restSeconds: z.number().int().min(0).max(900).optional(),
    rir: z.number().int().min(0).max(10).optional(),
    rpe: z.number().min(1).max(10).optional()
  })).min(1).max(200)
}).superRefine((input, context) => {
  // These rules compare multiple rows, so they cannot be expressed as single-field checks.
  // Set numbers are unique within an exercise, not across the whole session.
  // This preserves a stable row identity while allowing every movement to start at set 1.
  // A session needs at least one performed set. Other rows may remain
  // incomplete to preserve missed or abandoned work without inventing volume.
  if (!input.sets.some(set => set.completed)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["sets"],
      message: "Complete at least one set before saving a workout session."
    });
  }

  // Set numbers restart for each exercise; the composite key avoids false duplicates
  // when two movements both contain a first set.
  const seen = new Set();
  const counts = new Map();
  // Collect duplicate and per-exercise count information in one pass over the request.
  input.sets.forEach((set, index) => {
    const key = `${set.exerciseId}:${set.setNumber}`;
    if (seen.has(key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sets", index, "setNumber"],
        message: "Set numbers must be unique within each exercise."
      });
    }
    seen.add(key);
    counts.set(set.exerciseId, (counts.get(set.exerciseId) ?? 0) + 1);
  });

  // The browser also limits each exercise to 50 rows, but the API must enforce
  // the same cap because clients can bypass the form and submit requests directly.
  for (const count of counts.values()) {
    if (count > 50) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sets"],
        message: "An exercise cannot contain more than 50 sets in one session."
      });
      break;
    }
  }
});
