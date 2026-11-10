import { Router } from "express";
import { prisma } from "../prisma.js";
import { summariseDailyLogs, summariseWorkoutSessions } from "../utils/analytics.js";

export function createAnalyticsRouter(prismaClient = prisma) {
  const router = Router();

  // Keep dashboard summaries scoped to the signed-in account and a bounded calendar window.
  router.get("/summary", async (req, res, next) => {
    try {
      // A calendar-day window matches daily check-in history and avoids dropping today's
      // first hours or part of the oldest requested day when the request runs mid-day.
      const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
      const firstDate = new Date();
      firstDate.setUTCHours(0, 0, 0, 0);
      firstDate.setUTCDate(firstDate.getUTCDate() - (days - 1));

      // Both histories use the same boundary so the dashboard compares like-for-like periods.
      const [logs, sessions] = await Promise.all([
        prismaClient.dailyLog.findMany({
          where: { userId: req.userId, date: { gte: firstDate } },
          orderBy: { date: "asc" }
        }),
        prismaClient.workoutSession.findMany({
          where: { userId: req.userId, startedAt: { gte: firstDate } },
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

  return router;
}

export default createAnalyticsRouter();
