import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { config } from "../config.js";

export function createCoachRouter(prismaClient = prisma, fetchImpl = fetch) {
const router = Router();

const preferenceInput = z.object({
  style: z.enum(["gentle", "direct"]).default("gentle"),
  focus: z.enum(["energy", "consistency", "recovery"]).default("energy"),
  // External model processing stays off until the account owner explicitly opts in.
  aiEnabled: z.boolean().default(false)
});
const decisionInput = z.object({ decision: z.enum(["approved", "declined"]) });
const conversationInput = z.object({
  title: z.string().trim().min(1).max(80).optional()
});
const messageInput = z.object({ message: z.string().trim().min(1).max(2000) });


 // Conversation metadata is always scoped to the authenticated owner.
 router.get("/conversations", async (req, res, next) => {
   try {
     const conversations = await prismaClient.coachConversation.findMany({
       where: { userId: req.userId },
       orderBy: { updatedAt: "desc" },
       take: 50,
       include: {
         messages: { orderBy: { createdAt: "desc" }, take: 1,
           select: { id: true, role: true, content: true, createdAt: true } },
         _count: { select: { messages: true } }
       }
     });
     return res.json({ conversations });
   } catch (error) { return next(error); }
 });

 router.post("/conversations", async (req, res, next) => {
   try {
     const input = conversationInput.parse(req.body ?? {});
     const conversation = await prismaClient.coachConversation.create({
       data: { userId: req.userId, title: input.title ?? "New conversation" }
     });
     return res.status(201).json({ conversation });
   } catch (error) { return next(error); }
 });

 router.get("/conversations/:id/messages", async (req, res, next) => {
   try {
     const conversation = await prismaClient.coachConversation.findFirst({
       where: { id: req.params.id, userId: req.userId }, select: { id: true }
     });
     if (!conversation) return res.status(404).json({ error: "Conversation not found." });
     const messages = await prismaClient.coachMessage.findMany({
       where: { conversationId: conversation.id }, orderBy: { createdAt: "asc" }, take: 100,
       select: { id: true, role: true, content: true, createdAt: true }
     });
     return res.json({ messages });
   } catch (error) { return next(error); }
 });

 router.post("/conversations/:id/messages", async (req, res, next) => {
   try {
     const input = messageInput.parse(req.body);
     const conversation = await prismaClient.coachConversation.findFirst({
       where: { id: req.params.id, userId: req.userId }, select: { id: true, title: true }
     });
     if (!conversation) return res.status(404).json({ error: "Conversation not found." });

     // Only recent completed training details are sent; account IDs, private notes and wellbeing logs stay out.
     const sessions = await prismaClient.workoutSession.findMany({
       where: { userId: req.userId }, orderBy: { startedAt: "desc" }, take: 5,
       select: { startedAt: true, routine: { select: { name: true } },
         sets: { where: { completed: true }, select: { reps: true, weightKg: true, exercise: { select: { name: true } } } } }
     });
     const preference = await prismaClient.coachPreference.findUnique({ where: { userId: req.userId } });
     const response = await fetchImpl(config.COACH_SERVICE_URL + "/coach/conversation", {
       method: "POST", headers: { "content-type": "application/json" },
       body: JSON.stringify({ message: input.message, style: preference?.style ?? "gentle",
         focus: preference?.focus ?? "energy", aiEnabled: preference?.aiEnabled === true, context: { recentSessions: sessions.map(session => ({
           date: session.startedAt.toISOString().slice(0, 10), routine: session.routine?.name ?? null,
           exercises: session.sets.map(set => ({ name: set.exercise.name, reps: set.reps, weightKg: set.weightKg }))
         })) } })
     });
     if (!response.ok) return res.status(503).json({ error: "The coach is temporarily unavailable. Your message was not saved; please try again." });
     const result = await response.json();
     if (typeof result.message !== "string" || !result.message.trim())
       return res.status(503).json({ error: "The coach returned an incomplete response. Please try again." });

     const messages = await prismaClient.$transaction(async tx => {
       const userMessage = await tx.coachMessage.create({ data: { conversationId: conversation.id, role: "user", content: input.message } });
       const assistantMessage = await tx.coachMessage.create({ data: { conversationId: conversation.id, role: "assistant", content: result.message } });
       await tx.coachConversation.update({ where: { id: conversation.id }, data: {
         ...(conversation.title === "New conversation" ? { title: input.message.slice(0, 70) } : {}), updatedAt: new Date()
       } });
       return [userMessage, assistantMessage];
     });
     return res.status(201).json({ messages, responseMode: result.responseMode ?? "guided_rules" });
   } catch (error) { return next(error); }
 });

 router.delete("/conversations/:id", async (req, res, next) => {
   try {
     const result = await prismaClient.coachConversation.deleteMany({
       where: { id: req.params.id, userId: req.userId }
     });
     if (result.count === 0) return res.status(404).json({ error: "Conversation not found." });
     return res.json({ deleted: true });
   } catch (error) { return next(error); }
 });

// A user can tune the tone and emphasis without changing the coach's underlying safety rules.
router.get("/preferences", async (req, res, next) => {
  try {
    const preference = await prismaClient.coachPreference.findUnique({ where: { userId: req.userId } });
    return res.json({ preference: preference ?? { style: "gentle", focus: "energy" } });
  } catch (error) {
    return next(error);
  }
});

router.put("/preferences", async (req, res, next) => {
  try {
    const input = preferenceInput.parse(req.body);
    const preference = await prismaClient.coachPreference.upsert({
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
    const result = await prismaClient.coachEvent.updateMany({
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
      prismaClient.dailyLog.findMany({
        where: { userId: req.userId, date: { gte: since } },
        orderBy: { date: "asc" }
      }),
      prismaClient.coachPreference.findUnique({ where: { userId: req.userId } })
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
    const events = await prismaClient.$transaction(result.messages.map((message) =>
      prismaClient.coachEvent.create({
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
    const events = await prismaClient.coachEvent.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      take: 30
    });
    return res.json({ events });
  } catch (error) {
    return next(error);
  }
});

return router;
}

export default createCoachRouter();
