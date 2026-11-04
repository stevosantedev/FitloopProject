import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { config } from "../config.js";

const router = Router();

const preferenceInput = z.object({
  style: z.enum(["gentle", "direct"]).default("gentle"),
  focus: z.enum(["energy", "consistency", "recovery"]).default("energy")
});
const decisionInput = z.object({ decision: z.enum(["approved", "declined"]) });

// A user can tune the tone and emphasis without changing the coach's underlying safety rules.
router.get("/preferences", async (req, res, next) => {
  try {
    const preference = await prisma.coachPreference.findUnique({ where: { userId: req.userId } });
    return res.json({ preference: preference ?? { style: "gentle", focus: "energy" } });
  } catch (error) {
    return next(error);
  }
});

router.put("/preferences", async (req, res, next) => {
  try {
    const input = preferenceInput.parse(req.body);
    const preference = await prisma.coachPreference.upsert({
      where: { userId: req.userId },
      create: { userId: req.userId, ...input },
      update: input
    });
    return res.json({ preference });
  } catch (error) {
    return next(error);
  }
});

// Decisions are stored against the original message so coaching suggestions can be evaluated later.
router.patch("/events/:id/decision", async (req, res, next) => {
  try {
    const input = decisionInput.parse(req.body);
    const result = await prisma.coachEvent.updateMany({
      where: { id: req.params.id, userId: req.userId },
      data: { decision: input.decision }
    });
    if (result.count === 0) return res.status(404).json({ error: "Coach message not found." });
    return res.json({ decision: input.decision });
  } catch (error) {
    return next(error);
  }
});

router.post("/check-in", async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 14 * 86400000);
    const [logs, preference] = await Promise.all([
      prisma.dailyLog.findMany({
        where: { userId: req.userId, date: { gte: since } },
        orderBy: { date: "asc" }
      }),
      prisma.coachPreference.findUnique({ where: { userId: req.userId } })
    ]);

    // Only the recent measurements needed by the rules leave the API; names and email stay private.
    const response = await fetch(`${config.COACH_SERVICE_URL}/coach/check-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        style: preference?.style ?? "gentle",
        focus: preference?.focus ?? "energy",
        logs: logs.map(({ date, sleepMinutes, steps, mood, focusMinutes, activityMinutes }) => ({
          date: date.toISOString().slice(0, 10),
          sleepMinutes, steps, mood, focusMinutes, activityMinutes
        }))
      })
    });

    if (!response.ok) throw new Error("The coaching service is unavailable.");
    const result = await response.json();

    // Persist the rule and explanation shown to the user so the advice can be evaluated later.
    const events = await prisma.$transaction(result.messages.map((message) =>
      prisma.coachEvent.create({
        data: {
          userId: req.userId,
          ruleCode: message.kind,
          message: message.message,
          explanation: message.reasons.join(" "),
          metric: message.metric ?? null
        }
      })
    ));

    return res.json({ messages: events });
  } catch (error) {
    return next(error);
  }
});

router.get("/history", async (req, res, next) => {
  try {
    const events = await prisma.coachEvent.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      take: 30
    });
    return res.json({ events });
  } catch (error) {
    return next(error);
  }
});

export default router;
