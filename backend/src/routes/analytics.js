import { Router } from "express";
import { prisma } from "../prisma.js";
import { summariseDailyLogs, summariseWorkoutSessions } from "../utils/analytics.js";

const router = Router();

// Return a compact, account-scoped summary rather than exposing raw workout and wellbeing records to the dashboard.
router.get("/summary", async (req, res, next) => {
  try {
    // A bounded date range keeps summary queries quick and avoids loading a user's full history.
    // Clamp user input to a useful range so the endpoint cannot request unbounded history.
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
    const since = new Date(Date.now() - days * 86400000);
    // The two histories are independent; fetching them together reduces request latency.
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
