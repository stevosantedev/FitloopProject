/**
 * Workout API routes.
 *
 * This module owns the shared exercise catalogue plus the signed-in user's
 * routine and completed-session endpoints. Authentication is applied by the
 * parent router, so every private query must use req.userId rather than an ID
 * supplied in the request body.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { calculateMuscleVolume } from "../utils/muscleVolume.js";

const router = Router();

// Validate routine templates before touching the database. The exercise IDs are
// checked against the catalogue in the handler because Zod cannot verify records.
const routineInput = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  exercises: z.array(z.object({
    exerciseId: z.string().min(1),
    sortOrder: z.number().int().min(0).max(100).default(0)
  })).max(30)
});

// A session contains the sets the user actually performed. Bounds protect the
// API from unreasonable values while still allowing long sessions and high-rep work.
const sessionInput = z.object({
  routineId: z.string().optional(),
  notes: z.string().max(500).optional(),
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
  // Set numbers are unique within an exercise, not across the whole session.
  // This preserves a stable row identity while allowing every movement to start at set 1.
  const seen = new Set();
  const counts = new Map();
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

// Return shared exercises plus custom records owned by the signed-in user.
// Optional filters are composed in the database so the API never downloads the
// whole catalogue merely to search it in the browser.
router.get("/exercises", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const muscle = typeof req.query.muscle === "string" ? req.query.muscle.trim() : "";
    const equipment = typeof req.query.equipment === "string" ? req.query.equipment.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";

    const filters = [
      { OR: [{ isCustom: false }, { ownerId: req.userId }] },
      ...(search ? [{ OR: [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { aliases: { has: search } }
      ] }] : []),
      ...(muscle ? [{ muscles: { some: { muscle: { slug: muscle } } } }] : []),
      ...(equipment ? [{ equipment: { contains: equipment, mode: "insensitive" } }] : []),
      ...(category ? [{ category: { equals: category, mode: "insensitive" } }] : [])
    ];

    const exercises = await prisma.exercise.findMany({
      where: { AND: filters },
      include: { muscles: { include: { muscle: true }, orderBy: { role: "asc" } } },
      orderBy: [{ muscleGroup: "asc" }, { name: "asc" }],
      take: 250
    });
    return res.json({ exercises });
  } catch (error) {
    return next(error);
  }
});

// The canonical muscle list drives filters and the front/back anatomy interface.
// Returning a stable order keeps the visual map and accessible list consistent.
router.get("/muscles", async (_req, res, next) => {
  try {
    const muscles = await prisma.muscle.findMany({
      orderBy: [{ bodyRegion: "asc" }, { sortOrder: "asc" }, { name: "asc" }]
    });
    return res.json({ muscles });
  } catch (error) {
    return next(error);
  }
});

// Summarise completed training by anatomical muscle over a bounded time window.
// Primary links count as one set and secondary links as half a set. This is a
// transparent programming estimate, not a claim about exact muscle stimulus.
router.get("/muscle-stats", async (req, res, next) => {
  try {
    const rawDays = Number(req.query.days ?? 30);
    const days = Number.isInteger(rawDays) ? Math.max(1, Math.min(365, rawDays)) : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sets = await prisma.workoutSet.findMany({
      where: { completed: true, session: { userId: req.userId, startedAt: { gte: since } } },
      include: { exercise: { include: { muscles: { include: { muscle: true } } } }, session: { select: { startedAt: true } } }
    });
    // Keep the weighting calculation in a pure helper so it can be tested without a database.
    const totals = calculateMuscleVolume(sets);
    const muscles = await prisma.muscle.findMany({ orderBy: [{ bodyRegion: "asc" }, { sortOrder: "asc" }, { name: "asc" }] });
    const stats = muscles.map(muscle => {
      const total = totals.get(muscle.slug);
      const hoursSince = total?.lastTrainedAt ? (Date.now() - new Date(total.lastTrainedAt).getTime()) / 3600000 : null;
      return {
        ...muscle,
        effectiveSets: total?.effectiveSets ?? 0,
        primarySets: total?.primarySets ?? 0,
        secondarySets: total?.secondarySets ?? 0,
        lastTrainedAt: total?.lastTrainedAt ?? null,
        recoveryLabel: hoursSince === null ? "Not trained in this period" : hoursSince < 24 ? "Recently trained" : hoursSince < 48 ? "Trained within 48 hours" : "No recent session in 48 hours"
      };
    });
    return res.json({ days, method: "Primary set = 1.0; secondary set = 0.5. Recovery labels use time since the last logged session and are not physiological measurements.", muscles: stats });
  } catch (error) {
    return next(error);
  }
});

// List only this account's reusable templates. Including the join rows and their
// exercise records avoids a second request for every routine card in the UI.
router.get("/routines", async (req, res, next) => {
  try {
    const routines = await prisma.workoutRoutine.findMany({
      where: { userId: req.userId },
      include: { exercises: { include: { exercise: true }, orderBy: { sortOrder: "asc" } } },
      orderBy: { createdAt: "desc" }
    });
    return res.json({ routines });
  } catch (error) {
    return next(error);
  }
});

// Create a reusable template and preserve the order chosen in the workout builder.
// The nested create keeps the routine and its exercise links in one database write.
router.post("/routines", async (req, res, next) => {
  try {
    const input = routineInput.parse(req.body);
    // Check distinct IDs so selecting the same exercise twice does not make the
    // existence check fail. The original input array is still used below because
    // repeated exercises and their sort positions are meaningful in a routine.
    const exerciseIds = [...new Set(input.exercises.map(item => item.exerciseId))];

    // Confirm every exercise exists before linking it, so a user cannot create broken routine entries.
    const available = await prisma.exercise.findMany({ where: { id: { in: exerciseIds } }, select: { id: true } });
    if (available.length !== exerciseIds.length) {
      return res.status(400).json({ error: "One or more selected exercises do not exist." });
    }

    const routine = await prisma.workoutRoutine.create({
      data: {
        userId: req.userId,
        name: input.name,
        description: input.description,
        exercises: { create: input.exercises }
      },
      include: { exercises: { include: { exercise: true }, orderBy: { sortOrder: "asc" } } }
    });
    return res.status(201).json({ routine });
  } catch (error) {
    return next(error);
  }
});

// Return recent history newest-first. The limit keeps a dashboard request bounded;
// a dedicated pagination endpoint can replace this when the history grows.
router.get("/sessions", async (req, res, next) => {
  try {
    const sessions = await prisma.workoutSession.findMany({
      where: { userId: req.userId },
      include: { routine: true, sets: { include: { exercise: true }, orderBy: [{ exerciseId: "asc" }, { setNumber: "asc" }] } },
      orderBy: { startedAt: "desc" },
      take: 50
    });
    return res.json({ sessions });
  } catch (error) {
    return next(error);
  }
});

// Save a completed workout session, including every set performed during it.
// The session and its feed post are created together so the feed cannot advertise
// a workout whose history record failed to save.
router.post("/sessions", async (req, res, next) => {
  try {
    const input = sessionInput.parse(req.body);

    // A routine must belong to the signed-in user; knowing another routine ID grants no access.
    if (input.routineId) {
      const routine = await prisma.workoutRoutine.findFirst({
        where: { id: input.routineId, userId: req.userId },
        select: { id: true }
      });
      if (!routine) return res.status(404).json({ error: "Workout routine not found." });
    }

    // Validate every referenced exercise before writing any sets. A single bad
    // ID rejects the whole session, avoiding a partially recorded workout.
    const exerciseIds = [...new Set(input.sets.map(item => item.exerciseId))];
    const available = await prisma.exercise.findMany({ where: { id: { in: exerciseIds } }, select: { id: true } });
    if (available.length !== exerciseIds.length) {
      return res.status(400).json({ error: "One or more selected exercises do not exist." });
    }

    // The nested post create is part of the same Prisma operation. This keeps the
    // session and its social announcement consistent if either write fails.
    const session = await prisma.workoutSession.create({
      data: {
        userId: req.userId,
        routineId: input.routineId,
        notes: input.notes,
        endedAt: new Date(),
        sets: { create: input.sets },
        // Every completed session creates a friends-feed entry; feed visibility is still checked per connection.
        post: { create: { userId: req.userId, type: "workout" } }
      },
      include: { routine: true, sets: { include: { exercise: true } } }
    });
    return res.status(201).json({ session });
  } catch (error) {
    return next(error);
  }
});

export default router;
