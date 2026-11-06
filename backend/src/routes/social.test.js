import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { createSocialRouter } from "./social.js";

async function withSocialApi(prisma, run) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = "user-a"; next(); });
  app.use("/api/social", createSocialRouter(prisma));
  app.use((error, _req, res, _next) => {
    if (error?.name === "ZodError") return res.status(400).json({ error: "Invalid request." });
    return res.status(500).json({ error: "Unexpected test error." });
  });
  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  try { await run("http://127.0.0.1:" + address.port); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test("POST posts creates a friends-only update for the authenticated author", async () => {
  let args;
  const post = { id: "post-a", userId: "user-a", type: "update", text: "First training update" };
  const prisma = { feedPost: { create: async input => { args = input; return post; } } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/posts", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "  First training update  " })
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { post });
  });
  assert.deepEqual(args.data, { userId: "user-a", type: "update", text: "First training update" });
  assert.deepEqual(args.include.user.select, { id: true, username: true, displayName: true });
});

test("POST posts rejects blank and overlong updates before writing", async () => {
  let writes = 0;
  const prisma = { feedPost: { create: async () => { writes += 1; return {}; } } };
  await withSocialApi(prisma, async base => {
    for (const text of ["   ", "x".repeat(501)]) {
      const response = await fetch(base + "/api/social/posts", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ text })
      });
      assert.equal(response.status, 400);
    }
  });
  assert.equal(writes, 0);
});

test("DELETE posts only removes a post authored by the signed-in account", async () => {
  let query;
  const prisma = { feedPost: { deleteMany: async args => { query = args; return { count: 1 }; } } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/posts/post-a", { method: "DELETE" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deleted: true });
  });
  assert.deepEqual(query.where, { id: "post-a", userId: "user-a" });
});

test("DELETE posts returns not found for another author's post", async () => {
  const prisma = { feedPost: { deleteMany: async () => ({ count: 0 }) } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/posts/private-post", { method: "DELETE" });
    assert.equal(response.status, 404);
  });
});

test("PATCH profile updates only the authenticated account's display fields", async () => {
  let query;
  const profile = { id: "user-a", username: "runner", displayName: "Runner One", bio: "Building consistency." };
  const prisma = { user: { update: async args => { query = args; return profile; } } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/profile/me", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: " Runner One ", bio: "Building consistency." })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { profile });
  });
  assert.equal(query.where.id, "user-a");
  assert.deepEqual(query.data, { displayName: "Runner One", bio: "Building consistency." });
  assert.deepEqual(query.select, { id: true, username: true, displayName: true, bio: true, privateAccount: true });
});

test("PATCH profile rejects empty, overlong and unexpected profile fields", async () => {
  let writes = 0;
  const prisma = { user: { update: async () => { writes += 1; return {}; } } };
  await withSocialApi(prisma, async base => {
    for (const body of [{ displayName: " " }, { bio: "x".repeat(161) }, { email: "private@example.com" }]) {
      const response = await fetch(base + "/api/social/profile/me", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
      });
      assert.equal(response.status, 400);
    }
  });
  assert.equal(writes, 0);
});

test("private profile lookup is hidden from non-friends", async () => {
  const prisma = {
    user: { findUnique: async () => ({ id: "user-b", username: "private-runner", displayName: "Private Runner", bio: null, privateAccount: true }) },
    friendConnection: { findFirst: async () => null },
    userBlock: { findMany: async () => [] }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/profile/user-b");
    assert.equal(response.status, 404);
  });
});

test("private profile lookup is available to an accepted friend without exposing privacy settings", async () => {
  const prisma = {
    user: { findUnique: async () => ({ id: "user-b", username: "friend-runner", displayName: "Friend Runner", bio: "Training steadily.", privateAccount: true }) },
    friendConnection: { findFirst: async args => {
      assert.deepEqual(args.where, {
        status: "accepted",
        OR: [{ requesterId: "user-a", addresseeId: "user-b" }, { requesterId: "user-b", addresseeId: "user-a" }]
      });
      return { id: "friendship-a" };
    } },
    userBlock: { findMany: async () => [] }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/profile/user-b");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { profile: { id: "user-b", username: "friend-runner", displayName: "Friend Runner", bio: "Training steadily." } });
  });
});

test("public profile lookup is available without a friendship", async () => {
  const prisma = {
    user: { findUnique: async () => ({ id: "user-b", username: "open-runner", displayName: "Open Runner", bio: null, privateAccount: false }) },
    friendConnection: { findFirst: async () => { throw new Error("Public profiles do not need a friendship query."); } },
    userBlock: { findMany: async () => [] }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/profile/user-b");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { profile: { id: "user-b", username: "open-runner", displayName: "Open Runner", bio: null } });
  });
});

test("profile visibility can only be changed through the strict authenticated profile update", async () => {
  let update;
  const profile = { id: "user-a", username: "runner", displayName: "Runner", bio: null, privateAccount: false };
  const prisma = { user: { update: async args => { update = args; return profile; } } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/profile/me", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ privateAccount: false })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { profile });
  });
  assert.equal(update.where.id, "user-a");
  assert.deepEqual(update.data, { privateAccount: false });
});

test("feed includes display name with the safe author identity fields", async () => {
  let args;
  const prisma = {
    friendConnection: { findMany: async () => [] },
    userBlock: { findMany: async () => [] },
    feedPost: { findMany: async input => { args = input; return []; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/feed");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { posts: [] });
  });
  assert.deepEqual(args.include.user.select, { id: true, username: true, displayName: true });
  assert.deepEqual(args.where, { userId: { in: ["user-a"] } });
});

test("PATCH profile returns the updated private-account setting", async () => {
  const profile = { id: "user-a", username: "runner", displayName: null, bio: null, privateAccount: false };
  let query;
  const prisma = { user: { update: async args => { query = args; return profile; } } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/profile/me", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ privateAccount: false })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { profile });
  });
  assert.equal(query.select.privateAccount, true);
});


test("incoming pending requests can be declined only by their addressee", async () => {
  let query;
  const prisma = { friendConnection: { deleteMany: async args => { query = args; return { count: 1 }; } } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/friends/request-1/decline", { method: "POST" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { declined: true });
  });
  assert.deepEqual(query.where, { id: "request-1", addresseeId: "user-a", status: "pending" });
});

test("declining another user's request or a non-pending request returns not found", async () => {
  let query;
  const prisma = { friendConnection: { deleteMany: async args => { query = args; return { count: 0 }; } } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/friends/request-2/decline", { method: "POST" });
    assert.equal(response.status, 404);
  });
  assert.deepEqual(query.where, { id: "request-2", addresseeId: "user-a", status: "pending" });
});

test("outgoing pending requests can be cancelled only by their requester", async () => {
  let query;
  const prisma = { friendConnection: { deleteMany: async args => { query = args; return { count: 1 }; } } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/friends/request-3/cancel", { method: "POST" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { cancelled: true });
  });
  assert.deepEqual(query.where, { id: "request-3", requesterId: "user-a", status: "pending" });
});

test("cancelling another user's request or an accepted connection returns not found", async () => {
  let query;
  const prisma = { friendConnection: { deleteMany: async args => { query = args; return { count: 0 }; } } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/friends/request-4/cancel", { method: "POST" });
    assert.equal(response.status, 404);
  });
  assert.deepEqual(query.where, { id: "request-4", requesterId: "user-a", status: "pending" });
});

test("either member may remove an accepted connection, but not a pending or unrelated row", async () => {
  let query;
  const prisma = { friendConnection: { deleteMany: async args => { query = args; return { count: 1 }; } } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/friends/connection-5", { method: "DELETE" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { removed: true });
  });
  assert.deepEqual(query.where, {
    id: "connection-5", status: "accepted",
    OR: [{ requesterId: "user-a" }, { addresseeId: "user-a" }]
  });
});

test("removing a pending or unrelated connection returns not found", async () => {
  const prisma = { friendConnection: { deleteMany: async () => ({ count: 0 }) } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/friends/connection-6", { method: "DELETE" });
    assert.equal(response.status, 404);
  });
});


test("block atomically removes existing connections and creates an owner-scoped block", async () => {
  const calls = [];
  const tx = {
    friendConnection: { deleteMany: async args => { calls.push(["delete", args]); return { count: 1 }; } },
    userBlock: { upsert: async args => { calls.push(["upsert", args]); return { id: "block-a" }; } }
  };
  const prisma = {
    user: { findUnique: async () => ({ id: "user-b" }) },
    $transaction: async callback => callback(tx)
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/blocks/user-b", { method: "POST" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { blocked: true });
  });
  assert.deepEqual(calls[0][1].where, { OR: [{ requesterId: "user-a", addresseeId: "user-b" }, { requesterId: "user-b", addresseeId: "user-a" }] });
  assert.deepEqual(calls[1][1].where.blockerId_blockedUserId, { blockerId: "user-a", blockedUserId: "user-b" });
});

test("blocking self or a missing account is rejected", async () => {
  const prisma = { user: { findUnique: async () => null } };
  await withSocialApi(prisma, async base => {
    const self = await fetch(base + "/api/social/blocks/user-a", { method: "POST" });
    assert.equal(self.status, 400);
    const missing = await fetch(base + "/api/social/blocks/user-b", { method: "POST" });
    assert.equal(missing.status, 404);
  });
});

test("unblock can remove only a block created by the authenticated account", async () => {
  let query;
  const prisma = { userBlock: { deleteMany: async args => { query = args; return { count: 1 }; } } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/blocks/user-b", { method: "DELETE" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { unblocked: true });
  });
  assert.deepEqual(query.where, { blockerId: "user-a", blockedUserId: "user-b" });
});

test("friend discovery feed excludes accounts blocked in either direction", async () => {
  let feedQuery;
  const prisma = {
    friendConnection: { findMany: async () => [{ requesterId: "user-a", addresseeId: "user-b" }, { requesterId: "user-c", addresseeId: "user-a" }] },
    userBlock: { findMany: async () => [{ blockerId: "user-a", blockedUserId: "user-b" }] },
    feedPost: { findMany: async args => { feedQuery = args; return []; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/feed");
    assert.equal(response.status, 200);
  });
  assert.deepEqual(feedQuery.where, { userId: { in: ["user-a", "user-c"] } });
});

test("friend requests are not created when either account has blocked the other", async () => {
  let writes = 0;
  const prisma = {
    user: { findUnique: async () => ({ id: "user-b" }) },
    userBlock: { findFirst: async args => { assert.equal(args.where.OR.length, 2); return { id: "block-a" }; } },
    friendConnection: { findFirst: async () => { writes += 1; return null; }, create: async () => { writes += 1; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/friends/request", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "runner-b" })
    });
    assert.equal(response.status, 404);
  });
  assert.equal(writes, 0);
});

test("reports can be filed only against a visible post and store no reporter-supplied identity", async () => {
  let create;
  const prisma = {
    friendConnection: { findMany: async () => [] },
    userBlock: { findMany: async () => [] },
    feedPost: { findFirst: async () => ({ id: "post-b", userId: "user-b" }) },
    contentReport: { create: async args => { create = args; return { id: "report-a", reason: args.data.reason, status: "open", createdAt: new Date("2026-11-06T12:00:00Z") }; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/reports", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetType: "post", targetId: "post-b", reason: "harassment", details: "Abusive comments." })
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).report.status, "open");
  });
  assert.deepEqual(create.data, {
    reporterId: "user-a", reportedUserId: "user-b", postId: "post-b", reason: "harassment", details: "Abusive comments."
  });
});

test("reports reject unknown fields, self-reports and invisible posts", async () => {
  let writes = 0;
  const prisma = {
    user: { findUnique: async () => ({ id: "user-b" }) },
    friendConnection: { findMany: async () => [] },
    userBlock: { findMany: async () => [] },
    feedPost: { findFirst: async () => null },
    contentReport: { create: async () => { writes += 1; } }
  };
  await withSocialApi(prisma, async base => {
    const self = await fetch(base + "/api/social/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType: "user", targetId: "user-a", reason: "other" }) });
    assert.equal(self.status, 400);
    const invisible = await fetch(base + "/api/social/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType: "post", targetId: "hidden-post", reason: "spam" }) });
    assert.equal(invisible.status, 404);
    const extra = await fetch(base + "/api/social/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType: "user", targetId: "user-b", reason: "other", reporterId: "user-b" }) });
    assert.equal(extra.status, 400);
  });
  assert.equal(writes, 0);
});


test("a block hides a public profile even when it is otherwise discoverable", async () => {
  const prisma = {
    user: { findUnique: async () => ({ id: "user-b", username: "open-runner", displayName: "Open Runner", bio: null, privateAccount: false }) },
    userBlock: { findMany: async () => [{ blockerId: "user-b", blockedUserId: "user-a" }] }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/profile/user-b");
    assert.equal(response.status, 404);
  });
});
