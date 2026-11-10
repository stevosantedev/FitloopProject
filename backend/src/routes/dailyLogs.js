import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

export function createDailyLogsRouter(prismaClient = prisma) {
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

// Read only the current account's daily entries; the requested window is capped below.
router.get("/", async (req, res, next) => {
  try {
    // Keep the history window bounded to prevent a dashboard request from loading years of daily records.
    const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
    // Stored dates are UTC-midnight keys, so compare against a UTC calendar boundary.
    // Subtracting an exact number of hours from "now" can otherwise drop the oldest
    // requested day when the request happens later in the day.
    const firstDate = new Date();
    firstDate.setUTCHours(0, 0, 0, 0);
    firstDate.setUTCDate(firstDate.getUTCDate() - (days - 1));
    const logs = await prismaClient.dailyLog.findMany({
      where: {
        userId: req.userId,
        date: { gte: firstDate }
      },
      orderBy: { date: "desc" }
    });
    return res.json({ logs });
  } catch (error) {
    return next(error);
  }
});

// One row per account and calendar date lets a user correct a check-in without creating duplicates.
router.put("/", async (req, res, next) => {
  try {
    const input = dailyLogInput.parse(req.body);
    // UTC midnight gives each calendar date one stable key regardless of server timezone.
    const date = new Date(`${input.date}T00:00:00.000Z`);
    // The composite key includes the authenticated owner, so two accounts can log the same calendar date independently.
    const log = await prismaClient.dailyLog.upsert({
      where: { userId_date: { userId: req.userId, date } },
      create: { ...input, userId: req.userId, date },
      update: input
    });
    return res.json({ log });
  } catch (error) {
    return next(error);
  }
});

  return router;
}

export default createDailyLogsRouter();
