// Social routes manage profiles, friendships, blocks, reports and the friends-only feed.
// Every private lookup is scoped to the authenticated account, and block relationships
// are checked before profile or feed content is returned.
import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../prisma.js";

// The router accepts injected database and moderator identities so tests can verify access rules without production configuration.
export function createSocialRouter(prismaClient = prisma, moderatorIds = (process.env.MODERATOR_USER_IDS ?? "").split(",").map(id => id.trim()).filter(Boolean)) {
const router = Router();
const configuredModeratorIds = moderatorIds instanceof Set ? moderatorIds : new Set(moderatorIds);
const commentInput = z.object({ text: z.string().trim().min(1).max(500) });
const postInput = z.object({ text: z.string().trim().min(1).max(500) }).strict();
const reactionInput = z.object({ value: z.enum(["like", "strong", "clap"]).default("like") });
// Report submissions are limited per authenticated account to reduce spam without relying on client-side throttling.
const reportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, keyGenerator: req => req.userId });
// Search is more expensive than reading an existing connection and could be used to enumerate usernames.
const friendDiscoveryLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, keyGenerator: req => req.userId });
// Message requests and replies are rate-limited per signed-in account, not per IP address.
const pingRequestLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, keyGenerator: req => req.userId });
const pingMessageLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, keyGenerator: req => req.userId });
const pingRequestInput = z.object({
  username: z.string().trim().min(2).max(30).regex(/^[a-zA-Z0-9_]+$/),
  message: z.string().trim().min(1).max(2000)
}).strict();
const pingMessageInput = z.object({ message: z.string().trim().min(1).max(2000) }).strict();
const reportInput = z.object({
  targetType: z.enum(["user", "post", "message"]),
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
// Return only fields intended for a community profile; account email and private settings stay server-side.
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

// Profile edits accept only the explicitly supported fields so callers cannot mass-assign account properties.
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
// Visibility checks happen before profile details are selected, including private-account and block rules.
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
// Centralise block lookups so feed, profile and interaction routes apply the same two-way exclusion.
async function blockedIds(userId) {
  const blocks = await prismaClient.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedUserId: userId }] },
    select: { blockerId: true, blockedUserId: true }
  });
  return blocks.map(block => block.blockerId === userId ? block.blockedUserId : block.blockerId);
}

// Resolve accepted connections in both directions because a friendship is stored as one request row.
// Only accepted connections count as friends; pending requests do not grant feed access.
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

// Resolve posts that the signed-in member is allowed to discover or interact with.
// Friends can see each other's posts even when their profiles are private; public accounts
// are discoverable by everyone. A block overrides both paths, in either direction.
async function visiblePostWhere(userId) {
  const [friends, blocked] = await Promise.all([friendIds(userId), blockedIds(userId)]);
  return {
    OR: [
      { userId: { in: [userId, ...friends] } },
      { user: { privateAccount: false } }
    ],
    ...(blocked.length ? { userId: { notIn: blocked } } : {})
  };
}

// Notifications are secondary to the social action; a failed inbox insert must not undo
// a successful friend request, reaction or comment. The failure is logged for operations.
async function recordActivityNotification(data) {
  if (typeof prismaClient.activityNotification?.create !== "function") return;
  try {
    // Keep the two notification categories separate so a member can mute social updates
    // without missing private messages, or quiet Pings without hiding friend activity.
    if (typeof prismaClient.notificationPreference?.findUnique === "function") {
      const preference = await prismaClient.notificationPreference.findUnique({
        where: { userId: data.recipientId },
        select: { socialActivity: true, pings: true }
      });
      const category = data.type.startsWith("ping_") ? "pings" : "socialActivity";
      if (preference?.[category] === false) return;
    }
    await prismaClient.activityNotification.create({ data });
  } catch (error) {
    console.error("Unable to record a FitLoop activity notification.", error);
  }
}

const notificationPreferenceInput = z.object({
  socialActivity: z.boolean().optional(),
  pings: z.boolean().optional()
}).strict().refine(value => Object.keys(value).length > 0, "Choose at least one preference to update.");

// Defaults keep the existing inbox experience for accounts that have not opened settings yet.
router.get("/notification-preferences", async (req, res, next) => {
  try {
    const preference = await prismaClient.notificationPreference.findUnique({
      where: { userId: req.userId },
      select: { socialActivity: true, pings: true }
    });
    return res.json({
      preferences: {
        socialActivity: preference?.socialActivity ?? true,
        pings: preference?.pings ?? true
      }
    });
  } catch (error) { return next(error); }
});

// Only the authenticated member's own in-app preferences can be changed here.
// Push and email are intentionally absent until delivery consent and retention rules are defined.
router.patch("/notification-preferences", async (req, res, next) => {
  try {
    const input = notificationPreferenceInput.parse(req.body);
    const preference = await prismaClient.notificationPreference.upsert({
      where: { userId: req.userId },
      create: { userId: req.userId, ...input },
      update: input,
      select: { socialActivity: true, pings: true }
    });
    return res.json({ preferences: preference });
  } catch (error) { return next(error); }
});

// The inbox is private to its recipient. Blocked actors are filtered in both directions,
// and pagination is stable so a new notification cannot reshuffle an older page.
router.get("/notifications", async (req, res, next) => {
  try {
    const input = z.object({
      cursor: z.string().min(1).max(64).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20)
    }).strict().parse(req.query);
    const blocked = await blockedIds(req.userId);
    const visibleActor = blocked.length
      ? { OR: [{ actorId: null }, { actorId: { notIn: blocked } }] }
      : {};
    const where = { recipientId: req.userId, ...visibleActor };
    const rows = await prismaClient.activityNotification.findMany({
      where,
      include: {
        actor: { select: { id: true, username: true, displayName: true } },
        post: { select: { id: true, text: true, type: true } }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: input.limit + 1
    });
    const hasMore = rows.length > input.limit;
    const notifications = hasMore ? rows.slice(0, input.limit) : rows;
    const unreadCount = await prismaClient.activityNotification.count({
      where: { ...where, readAt: null }
    });
    return res.json({
      notifications,
      unreadCount,
      hasMore,
      nextCursor: hasMore ? notifications[notifications.length - 1]?.id ?? null : null
    });
  } catch (error) {
    return next(error);
  }
});

// A notification can only be marked read by its recipient; guessed IDs reveal nothing.
router.patch("/notifications/:id/read", async (req, res, next) => {
  try {
    const result = await prismaClient.activityNotification.updateMany({
      where: { id: req.params.id, recipientId: req.userId, readAt: null },
      data: { readAt: new Date() }
    });
    if (result.count === 0) return res.status(404).json({ error: "Notification not found." });
    return res.json({ read: true });
  } catch (error) {
    return next(error);
  }
});

// Marking the inbox read is one owner-scoped update, not a loop of client-supplied IDs.
router.post("/notifications/read-all", async (req, res, next) => {
  try {
    const result = await prismaClient.activityNotification.updateMany({
      where: { recipientId: req.userId, readAt: null },
      data: { readAt: new Date() }
    });
    return res.json({ updated: result.count });
  } catch (error) {
    return next(error);
  }
});

// Search returns only identity fields; private profile details remain behind the existing profile route.
router.get("/friends/discover", friendDiscoveryLimiter, async (req, res, next) => {
  try {
    const input = z.object({ q: z.string().trim().min(3).max(24) }).parse(req.query);

    // Exclude the signed-in user, existing relationships in either direction and accounts blocked by either member.
    const [connections, blocks] = await Promise.all([
      prismaClient.friendConnection.findMany({
        where: { OR: [{ requesterId: req.userId }, { addresseeId: req.userId }] },
        select: { requesterId: true, addresseeId: true }
      }),
      prismaClient.userBlock.findMany({
        where: { OR: [{ blockerId: req.userId }, { blockedUserId: req.userId }] },
        select: { blockerId: true, blockedUserId: true }
      })
    ]);
    const excludedIds = new Set([
      req.userId,
      ...connections.map(item => item.requesterId === req.userId ? item.addresseeId : item.requesterId),
      ...blocks.map(item => item.blockerId === req.userId ? item.blockedUserId : item.blockerId)
    ]);

    // Keep discovery useful without turning it into an unrestricted account directory.
    const people = await prismaClient.user.findMany({
      where: {
        id: { notIn: [...excludedIds] },
        OR: [
          { username: { startsWith: input.q, mode: "insensitive" } },
          { displayName: { contains: input.q, mode: "insensitive" } }
        ]
      },
      select: { id: true, username: true, displayName: true },
      orderBy: { username: "asc" },
      take: 10
    });
    return res.json({ people });
  } catch (error) {
    return next(error);
  }
});

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

// A request must not create a connection where either account has blocked the other.
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
    await recordActivityNotification({ recipientId: target.id, actorId: req.userId, type: "friend_request" });
    return res.status(201).json({ connection });
  } catch (error) {
    return next(error);
  }
});

router.post("/friends/:id/accept", async (req, res, next) => {
  try {
    // Only the person who received a request may accept it.
    // Read the requester only when notification persistence is available (the production Prisma client).
    const pending = typeof prismaClient.activityNotification?.create === "function"
      ? await prismaClient.friendConnection.findFirst({
          where: { id: req.params.id, addresseeId: req.userId, status: "pending" },
          select: { requesterId: true }
        })
      : null;
    const result = await prismaClient.friendConnection.updateMany({
      where: { id: req.params.id, addresseeId: req.userId, status: "pending" },
      data: { status: "accepted" }
    });
    if (result.count === 0) return res.status(404).json({ error: "Pending request not found." });
    if (pending?.requesterId) {
      await recordActivityNotification({ recipientId: pending.requesterId, actorId: req.userId, type: "friend_accepted" });
    }
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
// Blocking also invalidates the social connection so old friendship state cannot keep content visible.
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
// Validate the target and reason before recording a private moderation report; rate limiting is applied per reporter.
router.post("/reports", reportLimiter, async (req, res, next) => {
  try {
    const input = reportInput.parse(req.body);
    let reportTarget;
    if (input.targetType === "user") {
      if (input.targetId === req.userId) return res.status(400).json({ error: "You cannot report your own account." });
      reportTarget = await prismaClient.user.findUnique({ where: { id: input.targetId }, select: { id: true } });
      if (!reportTarget) return res.status(404).json({ error: "Report target not found." });
    } else if (input.targetType === "message") {
      const blocked = await blockedIds(req.userId);
      reportTarget = await prismaClient.directMessage.findFirst({
        where: {
          id: input.targetId,
          senderId: { not: req.userId, ...(blocked.length ? { notIn: blocked } : {}) },
          conversation: {
            status: { in: ["accepted", "pending"] },
            OR: [{ userAId: req.userId }, { userBId: req.userId }]
          }
        },
        select: { id: true, senderId: true, body: true, createdAt: true }
      });
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
        reportedUserId: input.targetType === "user" ? reportTarget.id : input.targetType === "message" ? reportTarget.senderId : reportTarget.userId,
        postId: input.targetType === "post" ? reportTarget.id : null,
        messageId: input.targetType === "message" ? reportTarget.id : null,
        // Preserve only the message explicitly reported, so account deletion cannot erase moderation evidence.
        reportedMessageBody: input.targetType === "message" ? reportTarget.body : null,
        reportedMessageCreatedAt: input.targetType === "message" ? reportTarget.createdAt : null,
        reportedMessageSenderId: input.targetType === "message" ? reportTarget.senderId : null,
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

// Moderator access comes from server configuration, not a client-supplied role or editable profile field.
function requireModerator(req, res, next) {
  if (!configuredModeratorIds.has(req.userId)) return res.status(403).json({ error: "Moderator access required." });
  return next();
}

// This signed-in capability check lets the client hide moderation controls without exposing the queue.
router.get("/moderation/capability", (req, res) => {
  return res.json({ isModerator: configuredModeratorIds.has(req.userId) });
});

// Only allowlisted moderators can inspect reports. Reporter and target projections intentionally omit email and credentials.
// The moderation queue is intentionally unavailable to ordinary users, even if they know the endpoint.
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
        post: { select: { id: true, text: true, user: { select: { id: true, username: true, displayName: true } } } },
        message: { select: { id: true, body: true, createdAt: true, sender: { select: { id: true, username: true, displayName: true } } } },
        // The snapshot remains available when the original message relation is cleared by account deletion.
        reportedMessageBody: true, reportedMessageCreatedAt: true, reportedMessageSenderId: true
      }
    });
    const hasMore = rows.length > input.limit;
    const reports = hasMore ? rows.slice(0, input.limit) : rows;
    return res.json({ reports, hasMore, nextCursor: hasMore ? reports[reports.length - 1].id : null });
  } catch (error) { return next(error); }
});

// A decision is conditional on the status just read, preventing two moderators silently overwriting each other.
// Validate state transitions and require an explanatory note before closing a report so decisions are auditable.
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


// Posts are limited to accepted friends and plain text; the server does not accept arbitrary media URLs.
// A request is a one-to-one conversation invitation with one introductory message.
 // Sort participant IDs before persistence so both directions resolve to the same unique pair.
router.post("/pings/requests", pingRequestLimiter, async (req, res, next) => {
  try {
    const input = pingRequestInput.parse(req.body);
    const recipient = await prismaClient.user.findUnique({
      where: { username: input.username.toLowerCase() },
      select: { id: true, username: true, displayName: true, privateAccount: true }
    });
    // Use one generic response for unknown, self and blocked targets to avoid account discovery.
    if (!recipient || recipient.id === req.userId) return res.status(404).json({ error: "This member is unavailable for a message request." });
    const blocked = await blockedIds(req.userId);
    if (blocked.includes(recipient.id)) return res.status(404).json({ error: "This member is unavailable for a message request." });
    // A private account can receive a request only from an existing accepted friend.
    if (recipient.privateAccount) {
      const friendship = await prismaClient.friendConnection.findFirst({
        where: {
          status: "accepted",
          OR: [
            { requesterId: req.userId, addresseeId: recipient.id },
            { requesterId: recipient.id, addresseeId: req.userId }
          ]
        },
        select: { id: true }
      });
      if (!friendship) return res.status(404).json({ error: "This member is unavailable for a message request." });
    }

    const [userAId, userBId] = [req.userId, recipient.id].sort();
    const existing = await prismaClient.directConversation.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
      select: { id: true, status: true, requesterId: true }
    });
    if (existing) {
      const message = existing.status === "accepted" ? "You already have a conversation with this member."
        : existing.status === "pending" ? "A message request already exists for this member."
        : "A message request cannot be sent to this member.";
      return res.status(409).json({ error: message });
    }

    const conversation = await prismaClient.directConversation.create({
      data: {
        userAId, userBId, requesterId: req.userId, status: "pending",
        messages: { create: { senderId: req.userId, body: input.message } }
      },
      include: {
        userA: { select: { id: true, username: true, displayName: true } },
        userB: { select: { id: true, username: true, displayName: true } },
        messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 }
      }
    });
    // The request notification contains no message text; private content stays in Pings.
    await recordActivityNotification({ recipientId: recipient.id, actorId: req.userId, type: "ping_request" });
    return res.status(201).json({ conversation });
  } catch (error) {
    if (error?.code === "P2002") return res.status(409).json({ error: "A message request already exists for this member." });
    return next(error);
  }
});

// Incoming requests are visible only to their recipient. Block checks are repeated on every read.
router.get("/pings/requests", async (req, res, next) => {
  try {
    const input = z.object({ cursor: z.string().min(1).max(64).optional(), limit: z.coerce.number().int().min(1).max(30).default(20) }).strict().parse(req.query);
    const blocked = await blockedIds(req.userId);
    const rows = await prismaClient.directConversation.findMany({
      where: {
        status: "pending", requesterId: { not: req.userId },
        OR: [{ userAId: req.userId }, { userBId: req.userId }],
        ...(blocked.length ? { AND: [{ userAId: { notIn: blocked } }, { userBId: { notIn: blocked } }] } : {})
      },
      include: {
        requester: { select: { id: true, username: true, displayName: true } },
        messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: input.limit + 1
    });
    const hasMore = rows.length > input.limit;
    const requests = hasMore ? rows.slice(0, input.limit) : rows;
    return res.json({ requests, hasMore, nextCursor: hasMore ? requests[requests.length - 1].id : null });
  } catch (error) { return next(error); }
});

// Accepted conversations are returned only to a participant and disappear from both inboxes after a block.
router.get("/pings/conversations", async (req, res, next) => {
  try {
    const input = z.object({ cursor: z.string().min(1).max(64).optional(), limit: z.coerce.number().int().min(1).max(30).default(20) }).strict().parse(req.query);
    const blocked = await blockedIds(req.userId);
    const rows = await prismaClient.directConversation.findMany({
      where: {
        status: "accepted",
        OR: [{ userAId: req.userId }, { userBId: req.userId }],
        ...(blocked.length ? { AND: [{ userAId: { notIn: blocked } }, { userBId: { notIn: blocked } }] } : {})
      },
      include: {
        userA: { select: { id: true, username: true, displayName: true } },
        userB: { select: { id: true, username: true, displayName: true } },
        messages: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 }
      },
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: input.limit + 1
    });
    const hasMore = rows.length > input.limit;
    const conversations = hasMore ? rows.slice(0, input.limit) : rows;
    // One grouped query supplies unread totals for the visible page without fetching message bodies.
    const unreadRows = conversations.length ? await prismaClient.directMessage.groupBy({
      by: ["conversationId"],
      where: {
        conversationId: { in: conversations.map(conversation => conversation.id) },
        senderId: { not: req.userId },
        readAt: null
      },
      _count: { _all: true }
    }) : [];
    const unreadByConversation = new Map(unreadRows.map(row => [row.conversationId, row._count._all]));
    const conversationsWithUnread = conversations.map(conversation => ({
      ...conversation,
      unreadCount: unreadByConversation.get(conversation.id) ?? 0
    }));
    return res.json({ conversations: conversationsWithUnread, hasMore, nextCursor: hasMore ? conversations[conversations.length - 1].id : null });
  } catch (error) { return next(error); }
});

// Only the person who received a request can accept it. A block makes it unavailable immediately.
router.post("/pings/requests/:id/accept", async (req, res, next) => {
  try {
    const blocked = await blockedIds(req.userId);
    const result = await prismaClient.directConversation.updateMany({
      where: {
        id: req.params.id, status: "pending", requesterId: { not: req.userId },
        OR: [{ userAId: req.userId }, { userBId: req.userId }],
        ...(blocked.length ? { AND: [{ userAId: { notIn: blocked } }, { userBId: { notIn: blocked } }] } : {})
      },
      data: { status: "accepted" }
    });
    if (!result.count) return res.status(404).json({ error: "Message request not found." });
    const conversation = await prismaClient.directConversation.findUnique({
      where: { id: req.params.id },
      include: {
        userA: { select: { id: true, username: true, displayName: true } },
        userB: { select: { id: true, username: true, displayName: true } }
      }
    });
    return res.json({ conversation });
  } catch (error) { return next(error); }
});

// Declining removes the introductory message but keeps a minimal declined pair record,
// preventing a second request from being used to repeatedly contact the same member.
router.post("/pings/requests/:id/decline", async (req, res, next) => {
  try {
    const result = await prismaClient.directConversation.updateMany({
      where: {
        id: req.params.id, status: "pending", requesterId: { not: req.userId },
        OR: [{ userAId: req.userId }, { userBId: req.userId }]
      },
      data: { status: "declined" }
    });
    if (!result.count) return res.status(404).json({ error: "Message request not found." });
    await prismaClient.directMessage.deleteMany({ where: { conversationId: req.params.id } });
    return res.json({ declined: true });
  } catch (error) { return next(error); }
});

// Message history is participant-scoped and uses a stable descending cursor for older pages.
router.get("/pings/conversations/:id/messages", async (req, res, next) => {
  try {
    const input = z.object({ cursor: z.string().min(1).max(64).optional(), limit: z.coerce.number().int().min(1).max(50).default(30) }).strict().parse(req.query);
    const blocked = await blockedIds(req.userId);
    const conversation = await prismaClient.directConversation.findFirst({
      where: {
        id: req.params.id, status: { in: ["accepted", "pending"] },
        OR: [{ userAId: req.userId }, { userBId: req.userId }],
        ...(blocked.length ? { AND: [{ userAId: { notIn: blocked } }, { userBId: { notIn: blocked } }] } : {})
      },
      select: { id: true }
    });
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    const rows = await prismaClient.directMessage.findMany({
      where: { conversationId: conversation.id },
      include: { sender: { select: { id: true, username: true, displayName: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      take: input.limit + 1
    });
    const hasMore = rows.length > input.limit;
    const messages = hasMore ? rows.slice(0, input.limit) : rows;
    return res.json({ messages, hasMore, nextCursor: hasMore ? messages[messages.length - 1].id : null });
  } catch (error) { return next(error); }
});

// A reply requires an accepted conversation; a pending request cannot be used to bypass consent.
router.post("/pings/conversations/:id/messages", pingMessageLimiter, async (req, res, next) => {
  try {
    const input = pingMessageInput.parse(req.body);
    const blocked = await blockedIds(req.userId);
    const conversation = await prismaClient.directConversation.findFirst({
      where: {
        id: req.params.id, status: "accepted",
        OR: [{ userAId: req.userId }, { userBId: req.userId }],
        ...(blocked.length ? { AND: [{ userAId: { notIn: blocked } }, { userBId: { notIn: blocked } }] } : {})
      },
      select: { id: true, userAId: true, userBId: true }
    });
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    const message = await prismaClient.directMessage.create({
      data: { conversationId: conversation.id, senderId: req.userId, body: input.message },
      include: { sender: { select: { id: true, username: true, displayName: true } } }
    });
    await prismaClient.directConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: message.createdAt } });
    // Keep notification previews private: the inbox identifies the sender but never copies message text.
    const otherParticipantId = conversation.userAId === req.userId ? conversation.userBId : conversation.userAId;
    await recordActivityNotification({ recipientId: otherParticipantId, actorId: req.userId, type: "ping_message" });
    return res.status(201).json({ message });
  } catch (error) { return next(error); }
});

// Read receipts are written only for messages addressed to the signed-in participant.
router.patch("/pings/conversations/:id/read", async (req, res, next) => {
  try {
    const blocked = await blockedIds(req.userId);
    const conversation = await prismaClient.directConversation.findFirst({
      where: {
        id: req.params.id, status: "accepted",
        OR: [{ userAId: req.userId }, { userBId: req.userId }],
        ...(blocked.length ? { AND: [{ userAId: { notIn: blocked } }, { userBId: { notIn: blocked } }] } : {})
      },
      select: { id: true }
    });
    if (!conversation) return res.status(404).json({ error: "Conversation not found." });
    const result = await prismaClient.directMessage.updateMany({
      where: { conversationId: conversation.id, senderId: { not: req.userId }, readAt: null },
      data: { readAt: new Date() }
    });
    return res.json({ read: result.count });
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

// A member's profile history is separate from the friends feed, so older posts are not hidden by feed pagination.
router.get("/profile/me/posts", async (req, res, next) => {
  try {
    // The owner comes only from authenticated middleware; clients cannot request another account's history.
    const input = z.object({
      cursor: z.string().min(1).max(64).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20)
    }).strict().parse(req.query);
    const rows = await prismaClient.feedPost.findMany({
      where: { userId: req.userId },
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

// Build the visible friend set first, then fetch only posts allowed by friendship and block relationships.
// Explore only includes posts from accounts that have explicitly made their profile public.
// Both directions of a block are excluded before pagination so blocked members cannot discover each other.
router.get("/explore", async (req, res, next) => {
  try {
    const input = z.object({ cursor: z.string().min(1).max(64).optional(), limit: z.coerce.number().int().min(1).max(30).default(12) }).strict().parse(req.query);
    const blocked = await blockedIds(req.userId);
    const rows = await prismaClient.feedPost.findMany({
      where: { userId: { not: req.userId, ...(blocked.length ? { notIn: blocked } : {}) }, user: { privateAccount: false } },
      include: { user: { select: { id: true, username: true, displayName: true, bio: true } }, session: { select: { id: true, startedAt: true, routine: { select: { name: true } }, sets: { select: { id: true, reps: true, weightKg: true, completed: true, exercise: { select: { id: true, name: true } } } } } }, reactions: { select: { value: true, userId: true } }, comments: { include: { user: { select: { id: true, username: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 10 }, _count: { select: { comments: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}), take: input.limit + 1
    });
    const hasMore = rows.length > input.limit;
    const posts = hasMore ? rows.slice(0, input.limit) : rows;
    return res.json({ posts, hasMore, nextCursor: hasMore ? posts[posts.length - 1].id : null });
  } catch (error) { return next(error); }
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

// Reactions are toggled for the current account only; repeated clicks should not create duplicate reactions.
router.post("/posts/:id/reactions", async (req, res, next) => {
  try {
    const input = reactionInput.parse(req.body);
    const visiblePosts = await visiblePostWhere(req.userId);

    // Resolve the post against the same public, friend and block rules used by discovery.
    const post = await prismaClient.feedPost.findFirst({ where: { id: req.params.id, ...visiblePosts }, select: { id: true, userId: true } });
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
    if (post.userId && post.userId !== req.userId) {
      await recordActivityNotification({ recipientId: post.userId, actorId: req.userId, postId: post.id, type: "reaction" });
    }
    return res.json({ reaction, removed: false });
  } catch (error) {
    return next(error);
  }
});

// Return older comments only when the signed-in member can still see the parent post.
// Comment pages are scoped to a post the current user is allowed to see.
router.get("/posts/:id/comments", async (req, res, next) => {
  try {
    const input = z.object({
      cursor: z.string().min(1).max(64).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20)
    }).strict().parse(req.query);
    const visiblePosts = await visiblePostWhere(req.userId);
    const post = await prismaClient.feedPost.findFirst({
      where: { id: req.params.id, ...visiblePosts },
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

// Check post visibility before accepting a reply so hidden or blocked content cannot be interacted with by ID.
router.post("/posts/:id/comments", async (req, res, next) => {
  try {
    const input = commentInput.parse(req.body);
    const visiblePosts = await visiblePostWhere(req.userId);

    // Re-check current visibility before allowing a comment, rather than trusting a post ID from the browser.
    const post = await prismaClient.feedPost.findFirst({ where: { id: req.params.id, ...visiblePosts }, select: { id: true, userId: true } });
    if (!post) return res.status(404).json({ error: "Post not found." });

    const comment = await prismaClient.feedComment.create({
      data: { userId: req.userId, postId: post.id, text: input.text },
      include: { user: { select: { id: true, username: true } } }
    });
    if (post.userId && post.userId !== req.userId) {
      await recordActivityNotification({ recipientId: post.userId, actorId: req.userId, postId: post.id, type: "comment" });
    }
    return res.status(201).json({ comment });
  } catch (error) {
    return next(error);
  }
});

// Authors may edit their own comments only while the parent post remains visible to them.
// The nested post filter makes ownership and current feed visibility part of the write itself.
// Only the comment author can edit the text; moderators use the separate report workflow.
router.patch("/comments/:id", async (req, res, next) => {
  try {
    const input = commentInput.strict().parse(req.body);
    const visiblePosts = await visiblePostWhere(req.userId);
    const result = await prismaClient.feedComment.updateMany({
      where: { id: req.params.id, userId: req.userId, post: visiblePosts },
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
// Keep comment deletion owner-scoped so a user cannot remove another person's contribution.
router.delete("/comments/:id", async (req, res, next) => {
  try {
    const visiblePosts = await visiblePostWhere(req.userId);
    const result = await prismaClient.feedComment.deleteMany({
      where: { id: req.params.id, userId: req.userId, post: visiblePosts }
    });
    if (result.count === 0) return res.status(404).json({ error: "Comment not found." });
    return res.json({ deleted: true });
  } catch (error) { return next(error); }
});

return router;
}

export default createSocialRouter();
