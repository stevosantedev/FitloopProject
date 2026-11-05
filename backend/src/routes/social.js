import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

export function createSocialRouter(prismaClient = prisma) {
const router = Router();
const commentInput = z.object({ text: z.string().trim().min(1).max(500) });
const postInput = z.object({ text: z.string().trim().min(1).max(500) });
const reactionInput = z.object({ value: z.enum(["like", "strong", "clap"]).default("like") });

// Resolve accepted connections in both directions because a friendship is stored as one request row.
async function friendIds(userId) {
  const connections = await prismaClient.friendConnection.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: userId }, { addresseeId: userId }]
    },
    select: { requesterId: true, addresseeId: true }
  });
  return connections.map(item => item.requesterId === userId ? item.addresseeId : item.requesterId);
}

router.get("/friends", async (req, res, next) => {
  try {
    const connections = await prismaClient.friendConnection.findMany({
      where: {
        OR: [{ requesterId: req.userId }, { addresseeId: req.userId }]
      },
      include: {
        requester: { select: { id: true, username: true } },
        addressee: { select: { id: true, username: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    return res.json({ connections });
  } catch (error) {
    return next(error);
  }
});

router.post("/friends/request", async (req, res, next) => {
  try {
    const input = z.object({ username: z.string().min(3).max(24) }).parse(req.body);
    const target = await prismaClient.user.findUnique({ where: { username: input.username }, select: { id: true } });
    if (!target || target.id === req.userId) return res.status(404).json({ error: "User not found." });

    // Check either direction to avoid creating two pending rows for the same pair of people.
    const existing = await prismaClient.friendConnection.findFirst({
      where: {
        OR: [
          { requesterId: req.userId, addresseeId: target.id },
          { requesterId: target.id, addresseeId: req.userId }
        ]
      }
    });
    if (existing) return res.status(409).json({ error: "A connection already exists for this user." });

    const connection = await prismaClient.friendConnection.create({
      data: { requesterId: req.userId, addresseeId: target.id }
    });
    return res.status(201).json({ connection });
  } catch (error) {
    return next(error);
  }
});

router.post("/friends/:id/accept", async (req, res, next) => {
  try {
    // Only the person who received a request may accept it.
    const result = await prismaClient.friendConnection.updateMany({
      where: { id: req.params.id, addresseeId: req.userId, status: "pending" },
      data: { status: "accepted" }
    });
    if (result.count === 0) return res.status(404).json({ error: "Pending request not found." });
    return res.json({ accepted: true });
  } catch (error) {
    return next(error);
  }
});


router.post("/posts", async (req, res, next) => {
  try {
    const input = postInput.parse(req.body);
    const post = await prismaClient.feedPost.create({
      data: { userId: req.userId, type: "update", text: input.text },
      include: {
        user: { select: { id: true, username: true } },
        reactions: { select: { value: true, userId: true } },
        comments: { include: { user: { select: { username: true } } }, orderBy: { createdAt: "asc" }, take: 20 }
      }
    });
    return res.status(201).json({ post });
  } catch (error) {
    return next(error);
  }
});

router.delete("/posts/:id", async (req, res, next) => {
  try {
    // Only the author can remove a post; deleting it cascades its reactions and comments.
    const result = await prismaClient.feedPost.deleteMany({
      where: { id: req.params.id, userId: req.userId }
    });
    if (result.count === 0) return res.status(404).json({ error: "Post not found." });
    return res.json({ deleted: true });
  } catch (error) {
    return next(error);
  }
});

router.get("/feed", async (req, res, next) => {
  try {
    const ids = [req.userId, ...await friendIds(req.userId)];
    const posts = await prismaClient.feedPost.findMany({
      where: { userId: { in: ids } },
      include: {
        user: { select: { id: true, username: true } },
        session: { include: { routine: true, sets: { include: { exercise: true } } } },
        reactions: { select: { value: true, userId: true } },
        comments: {
          include: { user: { select: { username: true } } },
          orderBy: { createdAt: "asc" },
          take: 20
        }
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    return res.json({ posts });
  } catch (error) {
    return next(error);
  }
});

router.post("/posts/:id/reactions", async (req, res, next) => {
  try {
    const input = reactionInput.parse(req.body);
    const ids = [req.userId, ...await friendIds(req.userId)];

    // A user can react only to a post they can already see in their friends-only feed.
    const post = await prismaClient.feedPost.findFirst({ where: { id: req.params.id, userId: { in: ids } }, select: { id: true } });
    if (!post) return res.status(404).json({ error: "Post not found." });

    const reaction = await prismaClient.reaction.upsert({
      where: { userId_postId: { userId: req.userId, postId: post.id } },
      create: { userId: req.userId, postId: post.id, value: input.value },
      update: { value: input.value }
    });
    return res.json({ reaction });
  } catch (error) {
    return next(error);
  }
});

router.post("/posts/:id/comments", async (req, res, next) => {
  try {
    const input = commentInput.parse(req.body);
    const ids = [req.userId, ...await friendIds(req.userId)];

    // Re-check feed visibility before allowing a comment, rather than trusting a post ID from the browser.
    const post = await prismaClient.feedPost.findFirst({ where: { id: req.params.id, userId: { in: ids } }, select: { id: true } });
    if (!post) return res.status(404).json({ error: "Post not found." });

    const comment = await prismaClient.feedComment.create({
      data: { userId: req.userId, postId: post.id, text: input.text },
      include: { user: { select: { username: true } } }
    });
    return res.status(201).json({ comment });
  } catch (error) {
    return next(error);
  }
});

return router;
}

export default createSocialRouter();
