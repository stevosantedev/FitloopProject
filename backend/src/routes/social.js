import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../prisma.js";

export function createSocialRouter(prismaClient = prisma, moderatorIds = (process.env.MODERATOR_USER_IDS ?? "").split(",").map(id => id.trim()).filter(Boolean)) {
const router = Router();
const configuredModeratorIds = moderatorIds instanceof Set ? moderatorIds : new Set(moderatorIds);
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

// A block is mutual for visibility: either party stops seeing the other's social activity.
async function blockedIds(userId) {
  const blocks = await prismaClient.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedUserId: userId }] },
    select: { blockerId: true, blockedUserId: true }
  });
  return blocks.map(block => block.blockerId === userId ? block.blockedUserId : block.blockerId);
}

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


// Blocking removes any pending/accepted relationship and hides both accounts' activity from one another.
router.post("/blocks/:userId", async (req, res, next) => {
  try {
    const targetId = req.params.userId;
    if (!targetId || targetId === req.userId) return res.status(400).json({ error: "You cannot block this account." });
    const target = await prismaClient.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) return res.status(404).json({ error: "User not found." });
    await prismaClient.$transaction(async transaction => {
      await transaction.friendConnection.deleteMany({
        where: { OR: [{ requesterId: req.userId, addresseeId: targetId }, { requesterId: targetId, addresseeId: req.userId }] }
      });
      await transaction.userBlock.upsert({
        where: { blockerId_blockedUserId: { blockerId: req.userId, blockedUserId: targetId } },
        create: { blockerId: req.userId, blockedUserId: targetId },
        update: {}
      });
    });
    return res.json({ blocked: true });
  } catch (error) { return next(error); }
});

router.get("/blocks", async (req, res, next) => {
  try {
    const blocks = await prismaClient.userBlock.findMany({
      where: { blockerId: req.userId },
      include: { blockedUser: { select: { id: true, username: true, displayName: true } } },
      orderBy: { createdAt: "desc" }
    });
    return res.json({ blocks });
  } catch (error) { return next(error); }
});

router.delete("/blocks/:userId", async (req, res, next) => {
  try {
    const result = await prismaClient.userBlock.deleteMany({
      where: { blockerId: req.userId, blockedUserId: req.params.userId }
    });
    if (result.count === 0) return res.status(404).json({ error: "Block not found." });
    return res.json({ unblocked: true });
  } catch (error) { return next(error); }
});

// Reports are accepted only for a real account or a post the reporter can already view.
router.post("/reports", reportLimiter, async (req, res, next) => {
  try {
    const input = reportInput.parse(req.body);
    let reportTarget;
    if (input.targetType === "user") {
      if (input.targetId === req.userId) return res.status(400).json({ error: "You cannot report your own account." });
      reportTarget = await prismaClient.user.findUnique({ where: { id: input.targetId }, select: { id: true } });
      if (!reportTarget) return res.status(404).json({ error: "Report target not found." });
    } else {
      const ids = [req.userId, ...await friendIds(req.userId)];
      reportTarget = await prismaClient.feedPost.findFirst({
        where: { id: input.targetId, userId: { in: ids } },
        select: { id: true, userId: true }
      });
      if (!reportTarget) return res.status(404).json({ error: "Report target not found." });
      if (reportTarget.userId === req.userId) return res.status(400).json({ error: "You cannot report your own post." });
    }
    const report = await prismaClient.contentReport.create({
      data: {
        reporterId: req.userId,
        reportedUserId: input.targetType === "user" ? reportTarget.id : reportTarget.userId,
        postId: input.targetType === "post" ? reportTarget.id : null,
        reason: input.reason,
        details: input.details || null
      },
      select: { id: true, reason: true, status: true, createdAt: true }
    });
    return res.status(201).json({ report });
  } catch (error) { return next(error); }
});


const reportStatuses = ["open", "reviewing", "resolved", "dismissed"];
const moderationQueueInput = z.object({
  status: z.enum(reportStatuses).default("open"),
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
}).strict();
const moderationDecisionInput = z.object({
  status: z.enum(["open", "reviewing", "resolved", "dismissed"]),
  resolutionNote: z.string().trim().min(10).max(1000).optional()
}).strict();

function requireModerator(req, res, next) {
  if (!configuredModeratorIds.has(req.userId)) return res.status(403).json({ error: "Moderator access required." });
  return next();
}

// This signed-in capability check lets the client hide moderation controls without exposing the queue.
router.get("/moderation/capability", (req, res) => {
  return res.json({ isModerator: configuredModeratorIds.has(req.userId) });
});

// Only allowlisted moderators can inspect reports. Reporter and target projections intentionally omit email and credentials.
router.get("/moderation/reports", requireModerator, async (req, res, next) => {
  try {
    const input = moderationQueueInput.parse(req.query);
    const rows = await prismaClient.contentReport.findMany({
      where: { status: input.status },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: input.limit + 1,
      select: {
        id: true, reason: true, details: true, status: true, createdAt: true,
        reviewedAt: true, resolutionNote: true,
        reporter: { select: { id: true, username: true, displayName: true } },
        reportedUser: { select: { id: true, username: true, displayName: true } },
        post: { select: { id: true, text: true, user: { select: { id: true, username: true, displayName: true } } } }
      }
    });
    const hasMore = rows.length > input.limit;
    const reports = hasMore ? rows.slice(0, input.limit) : rows;
    return res.json({ reports, hasMore, nextCursor: hasMore ? reports[reports.length - 1].id : null });
  } catch (error) { return next(error); }
});

// A decision is conditional on the status just read, preventing two moderators silently overwriting each other.
router.patch("/moderation/reports/:id", requireModerator, async (req, res, next) => {
  try {
    const input = moderationDecisionInput.parse(req.body);
    const current = await prismaClient.contentReport.findUnique({
      where: { id: req.params.id }, select: { id: true, status: true }
    });
    if (!current) return res.status(404).json({ error: "Report not found." });
    const allowedTransitions = {
      open: ["reviewing", "resolved", "dismissed"],
      reviewing: ["open", "resolved", "dismissed"],
      resolved: ["reviewing"],
      dismissed: ["reviewing"]
    };
    if (!allowedTransitions[current.status]?.includes(input.status)) {
      return res.status(409).json({ error: "This report cannot move to that status." });
    }
    if (["resolved", "dismissed"].includes(input.status) && !input.resolutionNote) {
      return res.status(400).json({ error: "Add a resolution note before closing this report." });
    }
    const updated = await prismaClient.contentReport.updateMany({
      where: { id: current.id, status: current.status },
      data: {
        status: input.status,
        reviewedById: req.userId,
        reviewedAt: new Date(),
        resolutionNote: ["resolved", "dismissed"].includes(input.status) ? input.resolutionNote : null
      }
    });
    if (updated.count === 0) return res.status(409).json({ error: "This report was updated by another moderator. Refresh the queue." });
    return res.json({ updated: true, status: input.status });
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
        comments: { include: { user: { select: { id: true, username: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 20 },
        _count: { select: { comments: true } }
      }
    });
    return res.status(201).json({ post });
  } catch (error) {
    return next(error);
  }
});

router.patch("/posts/:id", async (req, res, next) => {
  try {
    const input = postInput.parse(req.body);
    // Restrict edits to the signed-in author's text updates; workout records remain immutable feed summaries.
    const result = await prismaClient.feedPost.updateMany({
      where: { id: req.params.id, userId: req.userId, type: "update" },
      data: { text: input.text }
    });
    if (result.count === 0) return res.status(404).json({ error: "Post not found." });
    const post = await prismaClient.feedPost.findFirst({
      where: { id: req.params.id, userId: req.userId, type: "update" },
      include: {
        user: { select: { id: true, username: true, displayName: true } },
        reactions: { select: { value: true, userId: true } },
        comments: { include: { user: { select: { id: true, username: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 20 },
        _count: { select: { comments: true } }
      }
    });
    if (!post) return res.status(404).json({ error: "Post not found." });
    return res.json({ post });
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
    // Re-evaluate visibility for every page; a block or friendship change
    // must affect older posts just as it affects the first page.
    const input = z.object({
      cursor: z.string().min(1).max(64).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20)
    }).strict().parse(req.query);
    const ids = [req.userId, ...await friendIds(req.userId)];
    const rows = await prismaClient.feedPost.findMany({
      where: { userId: { in: ids } },
      include: {
        user: { select: { id: true, username: true, displayName: true } },
        session: { select: {
          id: true,
          startedAt: true,
          routine: { select: { name: true } },
          sets: {
            select: {
              id: true,
              reps: true,
              weightKg: true,
              completed: true,
              exercise: { select: { id: true, name: true } }
            }
          }
        } },
        reactions: { select: { value: true, userId: true } },
        comments: {
          include: { user: { select: { id: true, username: true } } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 20
        },
        _count: { select: { comments: true } }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: input.limit + 1
    });
    const hasMore = rows.length > input.limit;
    const posts = hasMore ? rows.slice(0, input.limit) : rows;
    return res.json({ posts, hasMore, nextCursor: hasMore ? posts[posts.length - 1].id : null });
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

    const key = { userId: req.userId, postId: post.id };
    const existing = await prismaClient.reaction.findUnique({ where: { userId_postId: key } });

    // Clicking the selected reaction removes it; choosing another value changes
    // the existing row rather than creating a second reaction for this account.
    if (existing?.value === input.value) {
      const removed = await prismaClient.reaction.deleteMany({
        where: { ...key, value: input.value }
      });
      return res.json({ reaction: null, removed: removed.count > 0 });
    }

    const reaction = await prismaClient.reaction.upsert({
      where: { userId_postId: key },
      create: { ...key, value: input.value },
      update: { value: input.value }
    });
    return res.json({ reaction, removed: false });
  } catch (error) {
    return next(error);
  }
});

// Return older comments only when the signed-in member can still see the parent post.
router.get("/posts/:id/comments", async (req, res, next) => {
  try {
    const input = z.object({
      cursor: z.string().min(1).max(64).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20)
    }).strict().parse(req.query);
    const ids = [req.userId, ...await friendIds(req.userId)];
    const post = await prismaClient.feedPost.findFirst({
      where: { id: req.params.id, userId: { in: ids } },
      select: { id: true }
    });
    if (!post) return res.status(404).json({ error: "Post not found." });

    const rows = await prismaClient.feedComment.findMany({
      where: { postId: post.id },
      include: { user: { select: { id: true, username: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: input.limit + 1
    });
    const hasMore = rows.length > input.limit;
    const comments = hasMore ? rows.slice(0, input.limit) : rows;
    return res.json({ comments, hasMore, nextCursor: hasMore ? comments[comments.length - 1].id : null });
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
      include: { user: { select: { id: true, username: true } } }
    });
    return res.status(201).json({ comment });
  } catch (error) {
    return next(error);
  }
});

// Authors may edit their own comments only while the parent post remains visible to them.
// The nested post filter makes ownership and current feed visibility part of the write itself.
router.patch("/comments/:id", async (req, res, next) => {
  try {
    const input = commentInput.strict().parse(req.body);
    const ids = [req.userId, ...await friendIds(req.userId)];
    const result = await prismaClient.feedComment.updateMany({
      where: { id: req.params.id, userId: req.userId, post: { userId: { in: ids } } },
      data: { text: input.text }
    });
    if (result.count === 0) return res.status(404).json({ error: "Comment not found." });
    const comment = await prismaClient.feedComment.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { id: true, username: true } } }
    });
    if (!comment) return res.status(404).json({ error: "Comment not found." });
    return res.json({ comment });
  } catch (error) { return next(error); }
});

// Deletion uses the same atomic author and current-visibility checks as editing.
router.delete("/comments/:id", async (req, res, next) => {
  try {
    const ids = [req.userId, ...await friendIds(req.userId)];
    const result = await prismaClient.feedComment.deleteMany({
      where: { id: req.params.id, userId: req.userId, post: { userId: { in: ids } } }
    });
    if (result.count === 0) return res.status(404).json({ error: "Comment not found." });
    return res.json({ deleted: true });
  } catch (error) { return next(error); }
});

return router;
}

export default createSocialRouter();
