import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../prisma.js";

export function createSocialRouter(prismaClient = prisma) {
const router = Router();
const commentInput = z.object({ text: z.string().trim().min(1).max(500) });
const postInput = z.object({ text: z.string().trim().min(1).max(500) });
const reactionInput = z.object({ value: z.enum(["like", "strong", "clap"]).default("like") });
const reportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, keyGenerator: req => req.userId });
const reportInput = z.object({
  targetType: z.enum(["user", "post"]),
  targetId: z.string().min(1).max(64),
  reason: z.enum(["spam", "harassment", "inappropriate", "impersonation", "other"]),
  details: z.string().trim().max(1000).optional()
}).strict();
const profileInput = z.object({
  displayName: z.string().trim().min(1).max(40).nullable().optional(),
  bio: z.string().trim().max(160).nullable().optional(),
  privateAccount: z.boolean().optional()
}).strict().refine(input => Object.keys(input).length > 0);

// Profile fields are deliberately limited to display identity; email and private account data never leave the API.
router.get("/profile/me", async (req, res, next) => {
  try {
    const profile = await prismaClient.user.findUnique({
      where: { id: req.userId },
      select: { id: true, username: true, displayName: true, bio: true, privateAccount: true }
    });
    if (!profile) return res.status(404).json({ error: "Profile not found." });
    return res.json({ profile });
  } catch (error) { return next(error); }
});

router.patch("/profile/me", async (req, res, next) => {
  try {
    const input = profileInput.parse(req.body);
    const profile = await prismaClient.user.update({
      where: { id: req.userId },
      data: input,
      select: { id: true, username: true, displayName: true, bio: true, privateAccount: true }
    });
    return res.json({ profile });
  } catch (error) { return next(error); }
});

// A profile lookup is available to signed-in members, but private profiles resolve only for the owner or an accepted friend.
router.get("/profile/:id", async (req, res, next) => {
  try {
    const profile = await prismaClient.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, username: true, displayName: true, bio: true, privateAccount: true }
    });
    if (!profile) return res.status(404).json({ error: "Profile not found." });
    if (profile.id !== req.userId && (await blockedIds(req.userId)).includes(profile.id)) {
      return res.status(404).json({ error: "Profile not found." });
    }
    if (profile.privateAccount && profile.id !== req.userId) {
      const friendship = await prismaClient.friendConnection.findFirst({
        where: {
          status: "accepted",
          OR: [
            { requesterId: req.userId, addresseeId: profile.id },
            { requesterId: profile.id, addresseeId: req.userId }
          ]
        },
        select: { id: true }
      });
      if (!friendship) return res.status(404).json({ error: "Profile not found." });
    }
    const { privateAccount, ...visibleProfile } = profile;
    return res.json({ profile: visibleProfile });
  } catch (error) { return next(error); }
});

// Resolve accepted connections in both directions because a friendship is stored as one request row.
async function friendIds(userId) {
  const connections = await prismaClient.friendConnection.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: userId }, { addresseeId: userId }]
    },
    select: { requesterId: true, addresseeId: true }
  });
  const blocked = new Set(await blockedIds(userId));
  return connections.map(item => item.requesterId === userId ? item.addresseeId : item.requesterId).filter(id => !blocked.has(id));
}

router.get("/friends", async (req, res, next) => {
  try {
    const connections = await prismaClient.friendConnection.findMany({
      where: {
        OR: [{ requesterId: req.userId }, { addresseeId: req.userId }]
      },
      include: {
        requester: { select: { id: true, username: true, displayName: true } },
        addressee: { select: { id: true, username: true, displayName: true } }
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
    const blocks = await prismaClient.userBlock.findFirst({
      where: { OR: [{ blockerId: req.userId, blockedUserId: target.id }, { blockerId: target.id, blockedUserId: req.userId }] },
      select: { id: true }
    });
    if (blocks) return res.status(404).json({ error: "User not found." });

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


// Declining is restricted to the intended recipient while the request is still pending.
router.post("/friends/:id/decline", async (req, res, next) => {
  try {
    const result = await prismaClient.friendConnection.deleteMany({
      where: { id: req.params.id, addresseeId: req.userId, status: "pending" }
    });
    if (result.count === 0) return res.status(404).json({ error: "Pending request not found." });
    return res.json({ declined: true });
  } catch (error) { return next(error); }
});

// The requester may withdraw only their own still-pending request.
router.post("/friends/:id/cancel", async (req, res, next) => {
  try {
    const result = await prismaClient.friendConnection.deleteMany({
      where: { id: req.params.id, requesterId: req.userId, status: "pending" }
    });
    if (result.count === 0) return res.status(404).json({ error: "Pending request not found." });
    return res.json({ cancelled: true });
  } catch (error) { return next(error); }
});

// Either member may remove an accepted connection; pending requests use the explicit actions above.
router.delete("/friends/:id", async (req, res, next) => {
  try {
    const result = await prismaClient.friendConnection.deleteMany({
      where: {
        id: req.params.id,
        status: "accepted",
        OR: [{ requesterId: req.userId }, { addresseeId: req.userId }]
      }
    });
    if (result.count === 0) return res.status(404).json({ error: "Accepted connection not found." });
    return res.json({ removed: true });
  } catch (error) { return next(error); }
});


router.post("/posts", async (req, res, next) => {
  try {
    const input = postInput.parse(req.body);
    const post = await prismaClient.feedPost.create({
      data: { userId: req.userId, type: "update", text: input.text },
      include: {
        user: { select: { id: true, username: true, displayName: true } },
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
        user: { select: { id: true, username: true, displayName: true } },
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
