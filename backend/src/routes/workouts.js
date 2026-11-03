import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

const router = Router();

const routineInput = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  exercises: z.array(z.object({
    exerciseId: z.string().min(1),
    sortOrder: z.number().int().min(0).max(100).default(0)
  })).max(30)
});

const sessionInput = z.object({
  routineId: z.string().optional(),
  notes: z.string().max(500).optional(),
  sets: z.array(z.object({
    exerciseId: z.string().min(1),
    setNumber: z.number().int().min(1).max(50),
    reps: z.number().int().min(1).max(500),
    weightKg: z.number().min(0).max(1000).optional(),
    completed: z.boolean().default(true)
  })).max(200)
});

// Only exercises already in the shared library are returned; custom exercises need ownership rules first.
router.get("/exercises", async (_req, res, next) => {
  try {
    const exercises = await prisma.exercise.findMany({
      where: { isCustom: false },
      orderBy: [{ muscleGroup: "asc" }, { name: "asc" }]
    });
    return res.json({ exercises });
  } catch (error) {
    return next(error);
  }
});

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

router.post("/routines", async (req, res, next) => {
  try {
    const input = routineInput.parse(req.body);
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

    const exerciseIds = [...new Set(input.sets.map(item => item.exerciseId))];
    const available = await prisma.exercise.findMany({ where: { id: { in: exerciseIds } }, select: { id: true } });
    if (available.length !== exerciseIds.length) {
      return res.status(400).json({ error: "One or more selected exercises do not exist." });
    }

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
