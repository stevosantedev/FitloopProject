import { Router } from "express";
import { prisma } from "../prisma.js";
import { summariseDailyLogs, summariseWorkoutSessions } from "../utils/analytics.js";

const router = Router();

router.get("/summary", async (req, res, next) => {
  try {
    // A bounded date range keeps summary queries quick and avoids loading a user's full history.
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
    const since = new Date(Date.now() - days * 86400000);
    const [logs, sessions] = await Promise.all([
      prisma.dailyLog.findMany({
        where: { userId: req.userId, date: { gte: since } },
        orderBy: { date: "asc" }
      }),
      prisma.workoutSession.findMany({
        where: { userId: req.userId, startedAt: { gte: since } },
        include: { sets: { include: { exercise: true } } },
        orderBy: { startedAt: "asc" }
      })
    ]);

    return res.json({
      periodDays: days,
      daily: summariseDailyLogs(logs),
      workouts: summariseWorkoutSessions(sessions)
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
