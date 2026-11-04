import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

const router = Router();

// Mood is a five-point self-report, not a clinical or mental-health assessment.
const dailyLogInput = z.object({
  date: z.string().date(),
  sleepMinutes: z.number().int().min(0).max(1440).optional(),
  steps: z.number().int().min(0).max(200000).optional(),
  activityMinutes: z.number().int().min(0).max(1440).optional(),
  mood: z.number().int().min(1).max(5).optional(),
  focusMinutes: z.number().int().min(0).max(1440).optional(),
  note: z.string().max(500).optional()
});

router.get("/", async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
    const logs = await prisma.dailyLog.findMany({
      where: {
        userId: req.userId,
        date: { gte: new Date(Date.now() - days * 86400000) }
      },
      orderBy: { date: "desc" }
    });
    return res.json({ logs });
  } catch (error) {
    return next(error);
  }
});

router.put("/", async (req, res, next) => {
  try {
    const input = dailyLogInput.parse(req.body);
    // UTC midnight gives each calendar date one stable key regardless of server timezone.
    const date = new Date(`${input.date}T00:00:00.000Z`);
    const log = await prisma.dailyLog.upsert({
      where: { userId_date: { userId: req.userId, date } },
      create: { ...input, userId: req.userId, date },
      update: input
    });
    return res.json({ log });
  } catch (error) {
    return next(error);
  }
});

export default router;
