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
import { calculatePersonalRecords } from "../utils/personalRecords.js";
import { sessionInput } from "../utils/workoutSessionInput.js";
import { buildProgressionSuggestions } from "../utils/progressionSuggestions.js";

/**
 * Create the workout router with an injectable Prisma client.
 *
 * Production uses the shared client imported above. Tests can provide a small
 * in-memory fake, exercising HTTP parsing, validation and ownership decisions
 * without requiring a running PostgreSQL server.
 */
export function createWorkoutRouter(prismaClient = prisma) {
const router = Router();

// Validate routine templates before touching the database. The exercise IDs are
// checked against the catalogue in the handler because Zod cannot verify records.
const routineInput = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  exercises: z.array(z.object({
    exerciseId: z.string().min(1),
    sortOrder: z.number().int().min(0).max(100).optional()
  })).min(1).max(30)
}).superRefine((input, context) => {
  // The join table has a unique routine/exercise key, so reject duplicate
  // movements here rather than allowing a database constraint to become a 500.
  const exerciseIds = input.exercises.map(item => item.exerciseId);
  if (new Set(exerciseIds).size !== exerciseIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["exercises"], message: "A routine cannot contain the same exercise more than once." });
  }

  const positions = input.exercises.map((item, index) => item.sortOrder ?? index);
  if (new Set(positions).size !== positions.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["exercises"], message: "Each routine exercise must have a unique position." });
  }
});

// A session contains the sets the user actually performed. Bounds protect the
// API from unreasonable values while still allowing long sessions and high-rep work.
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

    const exercises = await prismaClient.exercise.findMany({
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
    const muscles = await prismaClient.muscle.findMany({
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
    const sets = await prismaClient.workoutSet.findMany({
      where: { completed: true, session: { userId: req.userId, startedAt: { gte: since } } },
      include: { exercise: { include: { muscles: { include: { muscle: true } } } }, session: { select: { startedAt: true } } }
    });
    // Keep the weighting calculation in a pure helper so it can be tested without a database.
    const totals = calculateMuscleVolume(sets);
    const muscles = await prismaClient.muscle.findMany({ orderBy: [{ bodyRegion: "asc" }, { sortOrder: "asc" }, { name: "asc" }] });
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
    const routines = await prismaClient.workoutRoutine.findMany({
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
    // The request schema already guarantees unique exercise IDs and positions,
    // so this list can be used for one ownership-aware catalogue lookup.
    const exerciseIds = input.exercises.map(item => item.exerciseId);

    // Confirm every exercise exists before linking it, so a user cannot create broken routine entries.
    const available = await prismaClient.exercise.findMany({
      // Private custom movements must not be usable by another account merely
      // because an exercise ID was guessed or copied from an old request.
      where: {
        id: { in: exerciseIds },
        OR: [{ isCustom: false }, { ownerId: req.userId }]
      },
      select: { id: true }
    });
    if (available.length !== exerciseIds.length) {
      return res.status(400).json({ error: "One or more selected exercises do not exist." });
    }

    const routine = await prismaClient.workoutRoutine.create({
      data: {
        userId: req.userId,
        name: input.name,
        description: input.description,
        exercises: { create: input.exercises.map((item, index) => ({ ...item, sortOrder: item.sortOrder ?? index })) }
      },
      include: { exercises: { include: { exercise: true }, orderBy: { sortOrder: "asc" } } }
    });
    return res.status(201).json({ routine });
  } catch (error) {
    return next(error);
  }
});

// Replace a routine only when it belongs to the signed-in account. Revalidating
// the full exercise list prevents stale or private IDs entering an edited template.
router.put("/routines/:id", async (req, res, next) => {
  try {
    const input = routineInput.parse(req.body);
    const existing = await prismaClient.workoutRoutine.findFirst({
      where: { id: req.params.id, userId: req.userId },
      select: { id: true }
    });
    if (!existing) return res.status(404).json({ error: "Workout routine not found." });

    const exerciseIds = input.exercises.map(item => item.exerciseId);
    const available = await prismaClient.exercise.findMany({
      where: {
        id: { in: exerciseIds },
        OR: [{ isCustom: false }, { ownerId: req.userId }]
      },
      select: { id: true }
    });
    if (available.length !== exerciseIds.length) {
      return res.status(400).json({ error: "One or more selected exercises do not exist." });
    }

    const routine = await prismaClient.workoutRoutine.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        description: input.description,
        exercises: {
          deleteMany: {},
          create: input.exercises.map((item, index) => ({ ...item, sortOrder: item.sortOrder ?? index }))
        }
      },
      include: { exercises: { include: { exercise: true }, orderBy: { sortOrder: "asc" } } }
    });
    return res.json({ routine });
  } catch (error) {
    return next(error);
  }
});

// Delete only the caller's template. Past sessions keep their history; the
// schema's SetNull relation removes the routine link rather than deleting logs.
router.delete("/routines/:id", async (req, res, next) => {
  try {
    const referencedByPlan = await prismaClient.trainingPlanDay.count({
      where: { routineId: req.params.id, plan: { is: { userId: req.userId } } }
    });
    if (referencedByPlan > 0) {
      return res.status(409).json({ error: "This routine is part of a training plan. Update or delete that plan before deleting the routine." });
    }
    const result = await prismaClient.workoutRoutine.deleteMany({
      where: { id: req.params.id, userId: req.userId }
    });
    if (result.count === 0) return res.status(404).json({ error: "Workout routine not found." });
    return res.json({ deleted: true });
  } catch (error) {
    return next(error);
  }
});

// Personal records are calculated from all completed sets owned by this account.
// The API does not infer a load for bodyweight movements or include abandoned sets.
// Each programme day either reuses an owned routine or creates its own routine
// from selected catalogue exercises. Nested writes keep a new programme atomic.
const trainingPlanInput = z.object({
  name: z.string().trim().min(1).max(80),
  goal: z.enum(["general", "strength", "muscle"]),
  daysPerWeek: z.number().int().min(2).max(6),
  experience: z.enum(["beginner", "intermediate", "experienced"]),
  equipment: z.enum(["bodyweight", "dumbbells", "gym"]),
  days: z.array(z.object({
    dayNumber: z.number().int().min(1).max(6),
    label: z.string().trim().min(1).max(40),
    routineId: z.string().min(1).optional(),
    routineName: z.string().trim().min(1).max(80).optional(),
    exercises: z.array(z.object({
      exerciseId: z.string().min(1),
      sortOrder: z.number().int().min(0).max(100).optional()
    })).min(1).max(30).optional()
  }).superRefine((day, context) => {
    const usesSavedRoutine = Boolean(day.routineId);
    const createsRoutine = Boolean(day.routineName && day.exercises?.length);
    if (usesSavedRoutine === createsRoutine) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["routineId"], message: "Choose one saved routine or provide a new routine name and exercises." });
    }
    if (day.exercises) {
      const ids = day.exercises.map(item => item.exerciseId);
      const positions = day.exercises.map((item, index) => item.sortOrder ?? index);
      if (new Set(ids).size !== ids.length || new Set(positions).size !== positions.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["exercises"], message: "Exercises and their positions must be unique within a day." });
      }
    }
  })).min(2).max(6)
}).superRefine((input, context) => {
  if (input.days.length !== input.daysPerWeek) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["days"], message: "Add one workout day for each available training day." });
  }
  const dayNumbers = input.days.map(day => day.dayNumber);
  if (new Set(dayNumbers).size !== dayNumbers.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["days"], message: "Each training day must have a unique position." });
  }
});

const trainingPlanInclude = {
  days: {
    orderBy: { dayNumber: "asc" },
    include: { routine: { include: { exercises: { include: { exercise: true }, orderBy: { sortOrder: "asc" } } } } }
  }
};

async function validateTrainingPlanDays(prismaClient, userId, days) {
  const savedRoutineIds = days.filter(day => day.routineId).map(day => day.routineId);
  if (savedRoutineIds.length) {
    const routines = await prismaClient.workoutRoutine.findMany({
      where: { id: { in: [...new Set(savedRoutineIds)] }, userId },
      select: { id: true }
    });
    if (routines.length !== new Set(savedRoutineIds).size) return false;
  }

  const newExerciseIds = [...new Set(days.flatMap(day => (day.exercises ?? []).map(item => item.exerciseId)))];
  if (newExerciseIds.length) {
    const exercises = await prismaClient.exercise.findMany({
      where: {
        id: { in: newExerciseIds },
        OR: [{ isCustom: false }, { ownerId: userId }]
      },
      select: { id: true }
    });
    if (exercises.length !== newExerciseIds.length) return false;
  }
  return true;
}

function createTrainingPlanDay(day, userId) {
  if (day.routineId) {
    return { dayNumber: day.dayNumber, label: day.label, routine: { connect: { id: day.routineId } } };
  }
  return {
    dayNumber: day.dayNumber,
    label: day.label,
    routine: {
      create: {
        name: day.routineName,
        user: { connect: { id: userId } },
        exercises: {
          create: day.exercises.map((item, index) => ({
            sortOrder: item.sortOrder ?? index,
            exercise: { connect: { id: item.exerciseId } }
          }))
        }
      }
    }
  };
}

router.get("/training-plans", async (req, res, next) => {
  try {
    const plans = await prismaClient.trainingPlan.findMany({
      where: { userId: req.userId },
      include: trainingPlanInclude,
      orderBy: { updatedAt: "desc" }
    });
    return res.json({ plans });
  } catch (error) { return next(error); }
});

router.post("/training-plans", async (req, res, next) => {
  try {
    const input = trainingPlanInput.parse(req.body);
    if (!await validateTrainingPlanDays(prismaClient, req.userId, input.days)) {
      return res.status(400).json({ error: "One or more selected routines or exercises are unavailable." });
    }
    const plan = await prismaClient.trainingPlan.create({
      data: {
        userId: req.userId, name: input.name, goal: input.goal,
        daysPerWeek: input.daysPerWeek, experience: input.experience, equipment: input.equipment,
        days: { create: input.days.map(day => createTrainingPlanDay(day, req.userId)) }
      },
      include: trainingPlanInclude
    });
    return res.status(201).json({ plan });
  } catch (error) { return next(error); }
});

router.put("/training-plans/:id", async (req, res, next) => {
  try {
    const input = trainingPlanInput.parse(req.body);
    const existing = await prismaClient.trainingPlan.findFirst({
      where: { id: req.params.id, userId: req.userId }, select: { id: true }
    });
    if (!existing) return res.status(404).json({ error: "Training plan not found." });
    if (!await validateTrainingPlanDays(prismaClient, req.userId, input.days)) {
      return res.status(400).json({ error: "One or more selected routines or exercises are unavailable." });
    }
    const plan = await prismaClient.trainingPlan.update({
      where: { id: existing.id },
      data: {
        name: input.name, goal: input.goal, daysPerWeek: input.daysPerWeek,
        experience: input.experience, equipment: input.equipment,
        days: { deleteMany: {}, create: input.days.map(day => createTrainingPlanDay(day, req.userId)) }
      },
      include: trainingPlanInclude
    });
    return res.json({ plan });
  } catch (error) { return next(error); }
});

router.delete("/training-plans/:id", async (req, res, next) => {
  try {
    const result = await prismaClient.trainingPlan.deleteMany({
      where: { id: req.params.id, userId: req.userId }
    });
    if (result.count === 0) return res.status(404).json({ error: "Training plan not found." });
    return res.json({ deleted: true });
  } catch (error) { return next(error); }
});

// Compare the two latest completed sessions per movement for this account only.
router.get("/progression-suggestions", async (req, res, next) => {
  try {
    const sets = await prismaClient.workoutSet.findMany({
      where: { completed: true, session: { userId: req.userId } },
      include: { exercise: { select: { id: true, name: true } }, session: { select: { id: true, startedAt: true } } },
      orderBy: { session: { startedAt: "desc" } }, take: 500
    });
    return res.json({ suggestions: buildProgressionSuggestions(sets) });
  } catch (error) { return next(error); }
});

router.get("/personal-records", async (req, res, next) => {
  try {
    const sets = await prismaClient.workoutSet.findMany({
      where: { completed: true, session: { userId: req.userId } },
      include: {
        exercise: { select: { id: true, name: true } },
        session: { select: { id: true, startedAt: true } }
      }
    });
    return res.json({ records: calculatePersonalRecords(sets) });
  } catch (error) {
    return next(error);
  }
});

// Return recent history newest-first. The limit keeps a dashboard request bounded;
// a dedicated pagination endpoint can replace this when the history grows.
router.get("/sessions", async (req, res, next) => {
  try {
    const sessions = await prismaClient.workoutSession.findMany({
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
  let clientRequestId;
  try {
    const input = sessionInput.parse(req.body);
    clientRequestId = input.clientRequestId;

    // A queued browser request may be retried after a lost connection or page
    // reload. Return the original session instead of creating duplicate volume
    // or a second friends-feed post for the same client-generated request key.
    if (clientRequestId) {
      const existing = await prismaClient.workoutSession.findFirst({
        where: { userId: req.userId, clientRequestId },
        include: { routine: true, sets: { include: { exercise: true } } }
      });
      if (existing) return res.status(200).json({ session: existing });
    }

    // A routine must belong to the signed-in user; knowing another routine ID grants no access.
    if (input.routineId) {
      const routine = await prismaClient.workoutRoutine.findFirst({
        where: { id: input.routineId, userId: req.userId },
        select: { id: true }
      });
      if (!routine) return res.status(404).json({ error: "Workout routine not found." });
    }

    // Validate every referenced exercise before writing any sets. A single bad
    // ID rejects the whole session, avoiding a partially recorded workout.
    const exerciseIds = [...new Set(input.sets.map(item => item.exerciseId))];
    const available = await prismaClient.exercise.findMany({
      // Private custom movements must not be usable by another account merely
      // because an exercise ID was guessed or copied from an old request.
      where: {
        id: { in: exerciseIds },
        OR: [{ isCustom: false }, { ownerId: req.userId }]
      },
      select: { id: true }
    });
    if (available.length !== exerciseIds.length) {
      return res.status(400).json({ error: "One or more selected exercises do not exist." });
    }

    // The nested post create is part of the same Prisma operation. This keeps the
    // session and its social announcement consistent if either write fails.
    const session = await prismaClient.workoutSession.create({
      data: {
        userId: req.userId,
        routineId: input.routineId,
        notes: input.notes,
        clientRequestId,
        endedAt: new Date(),
        sets: { create: input.sets },
        // Every completed session creates a friends-feed entry; feed visibility is still checked per connection.
        post: { create: { userId: req.userId, type: "workout" } }
      },
      include: { routine: true, sets: { include: { exercise: true } } }
    });
    return res.status(201).json({ session });
  } catch (error) {
    // Two tabs can attempt the same queued request simultaneously. The unique
    // index is the final guard; the loser reads back the winning session.
    if (error?.code === "P2002" && clientRequestId) {
      try {
        const existing = await prismaClient.workoutSession.findFirst({
          where: { userId: req.userId, clientRequestId },
          include: { routine: true, sets: { include: { exercise: true } } }
        });
        if (existing) return res.status(200).json({ session: existing });
      } catch (lookupError) {
        return next(lookupError);
      }
    }
    return next(error);
  }
});

return router;
}

export default createWorkoutRouter();
