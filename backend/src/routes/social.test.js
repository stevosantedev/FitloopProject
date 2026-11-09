import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { createSocialRouter } from "./social.js";

// Each test gets an isolated HTTP server and injected Prisma behaviour, allowing privacy rules
// and failure paths to be checked without shared database state.
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

// Verify the server derives the author from authenticated context and stores trimmed text.
// The server derives the author from the session and applies the friends-only audience on creation.
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

// Invalid text must fail before any database write occurs.
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

// Editing is limited to the original author and to text updates, not generated workout posts.
test("PATCH posts edits only the authenticated author's text update", async () => {
  let updateQuery;
  let readQuery;
  const post = {
    id: "post-a", userId: "user-a", type: "update", text: "Edited training update",
    user: { id: "user-a", username: "runner", displayName: "Runner" },
    reactions: [], comments: [], _count: { comments: 0 }
  };
  const prisma = {
    feedPost: {
      updateMany: async args => { updateQuery = args; return { count: 1 }; },
      findFirst: async args => { readQuery = args; return post; }
    }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/posts/post-a", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "  Edited training update  " })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { post });
  });
  assert.deepEqual(updateQuery.where, { id: "post-a", userId: "user-a", type: "update" });
  assert.deepEqual(updateQuery.data, { text: "Edited training update" });
  assert.deepEqual(readQuery.where, { id: "post-a", userId: "user-a", type: "update" });
  assert.deepEqual(readQuery.include.user.select, { id: true, username: true, displayName: true });
});

// Ownership and post type are checked together so workout history cannot be rewritten.
test("PATCH posts cannot edit another author's post or a workout post", async () => {
  let reads = 0;
  const prisma = {
    feedPost: {
      updateMany: async args => {
        assert.deepEqual(args.where, { id: "post-a", userId: "user-a", type: "update" });
        return { count: 0 };
      },
      findFirst: async () => { reads += 1; return null; }
    }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/posts/post-a", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Attempted edit" })
    });
    assert.equal(response.status, 404);
  });
  assert.equal(reads, 0);
});

// Strict payload validation prevents accidental or mass-assignment updates.
test("PATCH posts rejects blank, overlong and unexpected fields before writing", async () => {
  let writes = 0;
  const prisma = { feedPost: { updateMany: async () => { writes += 1; return { count: 1 }; } } };
  await withSocialApi(prisma, async base => {
    for (const body of [{ text: " " }, { text: "x".repeat(501) }, { text: "Valid text", userId: "user-b" }]) {
      const response = await fetch(base + "/api/social/posts/post-a", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
      });
      assert.equal(response.status, 400);
    }
  });
  assert.equal(writes, 0);
});

// Deletion is scoped by both post ID and authenticated author.
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

// A not-found response avoids confirming that another account owns the supplied post ID.
test("DELETE posts returns not found for another author's post", async () => {
  const prisma = { feedPost: { deleteMany: async () => ({ count: 0 }) } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/posts/private-post", { method: "DELETE" });
    assert.equal(response.status, 404);
  });
});

// Profile updates use the session identity and expose only approved public fields.
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

// Validate profile changes before persistence so unsupported fields cannot be smuggled into the update.
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

// A private profile should be indistinguishable from an unavailable profile to non-friends.
// A private account is not discoverable through profile details without an accepted connection.
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

// Accepted friends may see permitted profile details, but internal privacy controls remain private.
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

// Public visibility removes the friendship requirement without changing field-level privacy.
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

// The visibility switch is writable only through the owner's validated profile endpoint.
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

// Feed identity includes public display fields without exposing email or credentials.
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
    assert.deepEqual(await response.json(), { posts: [], hasMore: false, nextCursor: null });
  });
  assert.deepEqual(args.include.user.select, { id: true, username: true, displayName: true });
  assert.deepEqual(args.include.session.select, {
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
  });
  assert.deepEqual(args.where, { userId: { in: ["user-a"] } });
});

// The response confirms the saved visibility choice so the UI reflects persisted state.
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


// Only the recipient can reject an incoming request that is still pending.
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

// Do not disclose or mutate requests outside the recipient and pending-state boundary.
test("declining another user's request or a non-pending request returns not found", async () => {
  let query;
  const prisma = { friendConnection: { deleteMany: async args => { query = args; return { count: 0 }; } } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/friends/request-2/decline", { method: "POST" });
    assert.equal(response.status, 404);
  });
  assert.deepEqual(query.where, { id: "request-2", addresseeId: "user-a", status: "pending" });
});

// The sender can withdraw a request before it is accepted.
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

// A sender cannot cancel another person's request or remove an accepted friendship through this route.
test("cancelling another user's request or an accepted connection returns not found", async () => {
  let query;
  const prisma = { friendConnection: { deleteMany: async args => { query = args; return { count: 0 }; } } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/friends/request-4/cancel", { method: "POST" });
    assert.equal(response.status, 404);
  });
  assert.deepEqual(query.where, { id: "request-4", requesterId: "user-a", status: "pending" });
});

// Either friend can end an accepted connection, while pending requests keep separate controls.
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

// Removal must not become a shortcut for changing request state or targeting unrelated users.
test("removing a pending or unrelated connection returns not found", async () => {
  const prisma = { friendConnection: { deleteMany: async () => ({ count: 0 }) } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/friends/connection-6", { method: "DELETE" });
    assert.equal(response.status, 404);
  });
});


// Blocking must update both sides of the social relationship in one transaction.
// Blocking and connection cleanup share a transaction so the accounts cannot remain partially linked.
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

// Reject impossible block targets before writing relationship state.
test("blocking self or a missing account is rejected", async () => {
  const prisma = { user: { findUnique: async () => null } };
  await withSocialApi(prisma, async base => {
    const self = await fetch(base + "/api/social/blocks/user-a", { method: "POST" });
    assert.equal(self.status, 400);
    const missing = await fetch(base + "/api/social/blocks/user-b", { method: "POST" });
    assert.equal(missing.status, 404);
  });
});

// A user can reverse their own block, not erase a block created by someone else.
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

// Blocks are symmetric for visibility even though each block record has a single owner.
// A block in either direction removes the relationship from discovery results.
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

// Discovery must not suggest the signed-in user, existing connections or accounts blocked in either direction.
test("friend discovery returns a bounded identity-only list excluding relationships and blocks", async () => {
  let searchQuery;
  const prisma = {
    friendConnection: { findMany: async () => [
      { requesterId: "user-a", addresseeId: "friend-a" },
      { requesterId: "friend-b", addresseeId: "user-a" }
    ] },
    userBlock: { findMany: async () => [{ blockerId: "blocked-user", blockedUserId: "user-a" }] },
    user: { findMany: async args => {
      searchQuery = args;
      return [{ id: "new-user", username: "runner-new", displayName: "New Runner" }];
    } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/friends/discover?q=run");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { people: [{ id: "new-user", username: "runner-new", displayName: "New Runner" }] });
  });
  assert.deepEqual(searchQuery.where.id.notIn, ["user-a", "friend-a", "friend-b", "blocked-user"]);
  assert.deepEqual(searchQuery.where.OR, [
    { username: { startsWith: "run", mode: "insensitive" } },
    { displayName: { contains: "run", mode: "insensitive" } }
  ]);
  assert.deepEqual(searchQuery.select, { id: true, username: true, displayName: true });
  assert.equal(searchQuery.take, 10);
});

// Repeated discovery queries are bounded per account so search cannot become an unrestricted directory scan.
test("friend discovery is rate-limited per authenticated account", async () => {
  const prisma = {
    friendConnection: { findMany: async () => [] },
    userBlock: { findMany: async () => [] },
    user: { findMany: async () => [] }
  };
  await withSocialApi(prisma, async base => {
    const responses = [];
    for (let attempt = 0; attempt < 31; attempt += 1) {
      responses.push(await fetch(base + "/api/social/friends/discover?q=run"));
    }
    assert.equal(responses.slice(0, 30).every(response => response.status === 200), true);
    assert.equal(responses[30].status, 429);
  });
});

// Reject broad terms before database access so a one-character query cannot enumerate the user base.
test("friend discovery rejects short search terms before reading account relationships", async () => {
  let reads = 0;
  const prisma = {
    friendConnection: { findMany: async () => { reads += 1; return []; } },
    userBlock: { findMany: async () => { reads += 1; return []; } },
    user: { findMany: async () => { reads += 1; return []; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/friends/discover?q=ab");
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Invalid request." });
  });
  assert.equal(reads, 0);
});

// Blocking prevents new requests even when the requester is not the blocker.
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

// The API verifies visibility and derives the reporter from authentication instead of trusting the payload.
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

// Strict validation blocks spoofed report metadata and reports against content the user cannot see.
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


// Blocking overrides public discoverability so profile privacy remains mutual.
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


// Feed pagination stays bounded and applies friendship plus block visibility in the database query.
// Profile history is owner-only and independent of the friends feed's pagination cursor.
test("GET profile me posts returns a bounded page for the authenticated account", async () => {
  let query;
  const rows = [
    { id: "post-new", userId: "user-a" },
    { id: "post-next", userId: "user-a" },
    { id: "post-older", userId: "user-a" }
  ];
  const prisma = { feedPost: { findMany: async args => { query = args; return rows; } } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/profile/me/posts?limit=2&cursor=post-cursor");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      posts: rows.slice(0, 2),
      hasMore: true,
      nextCursor: "post-next"
    });
  });
  assert.deepEqual(query.where, { userId: "user-a" });
  assert.deepEqual(query.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.deepEqual(query.cursor, { id: "post-cursor" });
  assert.equal(query.skip, 1);
  assert.equal(query.take, 3);
  assert.deepEqual(query.include.session.select.sets.select.exercise.select, { id: true, name: true });
  assert.equal("notes" in query.include.session.select, false);
});

test("GET profile me posts rejects invalid pagination before querying", async () => {
  let reads = 0;
  const prisma = { feedPost: { findMany: async () => { reads += 1; return []; } } };
  await withSocialApi(prisma, async base => {
    for (const query of ["?limit=0", "?limit=51", "?cursor=" + "x".repeat(65), "?unexpected=true"]) {
      const response = await fetch(base + "/api/social/profile/me/posts" + query);
      assert.equal(response.status, 400);
    }
  });
  assert.equal(reads, 0);
});

test("GET feed returns a bounded cursor page and scopes it to visible friends", async () => {
  let query;
  const rows = [{ id: "post-new" }, { id: "post-next" }, { id: "lookahead" }];
  const prisma = {
    friendConnection: { findMany: async () => [] },
    userBlock: { findMany: async () => [] },
    feedPost: { findMany: async args => { query = args; return rows; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/feed?limit=2&cursor=post-old");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { posts: rows.slice(0, 2), hasMore: true, nextCursor: "post-next" });
  });
  assert.deepEqual(query.where, { userId: { in: ["user-a"] } });
  assert.deepEqual(query.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.deepEqual(query.include.comments.orderBy, [{ createdAt: "asc" }, { id: "asc" }]);
  assert.deepEqual(query.cursor, { id: "post-old" });
  assert.equal(query.skip, 1);
  assert.equal(query.take, 3);
});

// Comment pages are available only after the parent post passes the feed visibility rules.
test("GET post comments returns a bounded cursor page only for visible posts", async () => {
  let postQuery, commentQuery;
  const rows = [{ id: "comment-1" }, { id: "comment-2" }, { id: "comment-lookahead" }];
  const prisma = {
    friendConnection: { findMany: async () => [] },
    userBlock: { findMany: async () => [] },
    feedPost: { findFirst: async args => { postQuery = args; return { id: "post-visible" }; } },
    feedComment: { findMany: async args => { commentQuery = args; return rows; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/posts/post-visible/comments?limit=2&cursor=comment-old");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { comments: rows.slice(0, 2), hasMore: true, nextCursor: "comment-2" });
  });
  assert.deepEqual(postQuery.where, { id: "post-visible", OR: [{ userId: { in: ["user-a"] } }, { user: { privateAccount: false } }] });
  assert.deepEqual(commentQuery.where, { postId: "post-visible" });
  assert.deepEqual(commentQuery.orderBy, [{ createdAt: "asc" }, { id: "asc" }]);
  assert.deepEqual(commentQuery.cursor, { id: "comment-old" });
  assert.equal(commentQuery.skip, 1);
  assert.equal(commentQuery.take, 3);
});

// Hidden posts and malformed cursors fail safely without leaking comment counts or content.
test("GET post comments hides unavailable posts and rejects invalid pagination", async () => {
  let reads = 0;
  const prisma = {
    friendConnection: { findMany: async () => [] },
    userBlock: { findMany: async () => [] },
    feedPost: { findFirst: async () => null },
    feedComment: { findMany: async () => { reads += 1; return []; } }
  };
  await withSocialApi(prisma, async base => {
    const hidden = await fetch(base + "/api/social/posts/hidden-post/comments");
    assert.equal(hidden.status, 404);
    for (const query of ["?limit=0", "?limit=51", "?cursor="]) {
      const invalid = await fetch(base + "/api/social/posts/hidden-post/comments" + query);
      assert.equal(invalid.status, 400);
    }
  });
  assert.equal(reads, 0);
});

// Reject malformed pagination before it can trigger an unbounded or ambiguous query.
test("GET feed rejects invalid cursors and page sizes before querying", async () => {
  let reads = 0;
  const prisma = {
    friendConnection: { findMany: async () => [] },
    userBlock: { findMany: async () => [] },
    feedPost: { findMany: async () => { reads += 1; return []; } }
  };
  await withSocialApi(prisma, async base => {
    for (const query of ["?limit=0", "?limit=51", "?cursor="]) {
      const response = await fetch(base + "/api/social/feed" + query);
      assert.equal(response.status, 400);
    }
  });
  assert.equal(reads, 0);
});



// Comment ownership and current post visibility are both required for edits.
test("PATCH comments edits only the author's comment on a currently visible post", async () => {
  let updateArgs, lookupArgs;
  const comment = { id: "comment-a", text: "Updated support", user: { id: "user-a", username: "alice" } };
  const prisma = {
    friendConnection: { findMany: async () => [] },
    userBlock: { findMany: async () => [] },
    feedComment: {
      updateMany: async args => { updateArgs = args; return { count: 1 }; },
      findUnique: async args => { lookupArgs = args; return comment; }
    }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/comments/comment-a", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "  Updated support  " })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { comment });
  });
  assert.deepEqual(updateArgs.where, { id: "comment-a", userId: "user-a", post: { OR: [{ userId: { in: ["user-a"] } }, { user: { privateAccount: false } }] } });
  assert.deepEqual(updateArgs.data, { text: "Updated support" });
  assert.deepEqual(lookupArgs.include.user.select, { id: true, username: true });
});

// Do not expose another person's comment through mutation responses or accept unexpected fields.
test("PATCH comments hides other authors' comments and rejects invalid payloads", async () => {
  let writes = 0;
  const prisma = {
    friendConnection: { findMany: async () => [] },
    userBlock: { findMany: async () => [] },
    feedComment: { updateMany: async () => { writes += 1; return { count: 0 }; } }
  };
  await withSocialApi(prisma, async base => {
    const hidden = await fetch(base + "/api/social/comments/another-users-comment", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Trying to edit another person's comment" })
    });
    assert.equal(hidden.status, 404);
    for (const body of [{ text: "  " }, { text: "valid", extra: true }, { text: "x".repeat(501) }]) {
      const response = await fetch(base + "/api/social/comments/another-users-comment", {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
      });
      assert.equal(response.status, 400);
    }
  });
  assert.equal(writes, 1);
});

// A comment can be removed only by its author while its parent post remains visible.
test("DELETE comments removes only the author's comment on a currently visible post", async () => {
  let query;
  const prisma = {
    friendConnection: { findMany: async () => [] },
    userBlock: { findMany: async () => [] },
    feedComment: { deleteMany: async args => { query = args; return { count: 1 }; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/comments/comment-a", { method: "DELETE" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deleted: true });
  });
  assert.deepEqual(query.where, { id: "comment-a", userId: "user-a", post: { OR: [{ userId: { in: ["user-a"] } }, { user: { privateAccount: false } }] } });
});

// The response does not distinguish an unowned comment from one attached to hidden content.
test("DELETE comments returns not found for another author or a post outside the current feed", async () => {
  const prisma = {
    friendConnection: { findMany: async () => [] },
    userBlock: { findMany: async () => [] },
    feedComment: { deleteMany: async () => ({ count: 0 }) }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/comments/private-comment", { method: "DELETE" });
    assert.equal(response.status, 404);
  });
});

// Moderator access comes from deployment configuration, not user-editable profile data.
test("moderation capability is derived from the server-side moderator allowlist", async () => {
  const prisma = {};
  await withSocialApi(prisma, async base => {
    const ordinary = await fetch(base + "/api/social/moderation/capability");
    assert.deepEqual(await ordinary.json(), { isModerator: false });
  });
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.userId = "user-a"; next(); });
  app.use("/api/social", createSocialRouter(prisma, ["user-a"]));
  const server = app.listen(0); await once(server, "listening");
  try {
    const response = await fetch("http://127.0.0.1:" + server.address().port + "/api/social/moderation/capability");
    assert.deepEqual(await response.json(), { isModerator: true });
  } finally { await new Promise(resolve => server.close(resolve)); }
});

// Reject unauthorized moderators before touching private report records.
test("moderation queue is inaccessible to non-moderators and does not query reports", async () => {
  let reads = 0;
  const prisma = { contentReport: { findMany: async () => { reads += 1; return []; } } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/moderation/reports");
    assert.equal(response.status, 403);
  });
  assert.equal(reads, 0);
});

// The review queue returns only needed fields and limits each page.
test("moderator queue filters status, uses bounded cursor pagination and safe identity projections", async () => {
  let query;
  const reports = [{ id: "report-1" }, { id: "report-2" }];
  const prisma = { contentReport: { findMany: async args => { query = args; return reports; } } };
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.userId = "moderator-a"; next(); });
  app.use("/api/social", createSocialRouter(prisma, ["moderator-a"]));
  const server = app.listen(0); await once(server, "listening");
  try {
    const response = await fetch("http://127.0.0.1:" + server.address().port + "/api/social/moderation/reports?status=open&cursor=report-0&limit=1");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { reports: [reports[0]], hasMore: true, nextCursor: "report-1" });
  } finally { await new Promise(resolve => server.close(resolve)); }
  assert.deepEqual(query.where, { status: "open" });
  assert.deepEqual(query.orderBy, [{ createdAt: "asc" }, { id: "asc" }]);
  assert.equal(query.take, 2);
  assert.deepEqual(query.cursor, { id: "report-0" });
  assert.deepEqual(query.select.reporter.select, { id: true, username: true, displayName: true });
  assert.deepEqual(query.select.reportedUser.select, { id: true, username: true, displayName: true });
});

// Resolution needs a valid state transition and an audit note rather than an unexplained status flip.
test("moderator decisions require a valid transition and an explanatory note to close", async () => {
  let update;
  const prisma = { contentReport: {
    findUnique: async () => ({ id: "report-1", status: "open" }),
    updateMany: async args => { update = args; return { count: 1 }; }
  } };
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.userId = "moderator-a"; next(); });
  app.use("/api/social", createSocialRouter(prisma, ["moderator-a"]));
  const server = app.listen(0); await once(server, "listening");
  try {
    const base = "http://127.0.0.1:" + server.address().port + "/api/social/moderation/reports/report-1";
    const missingNote = await fetch(base, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "resolved" }) });
    assert.equal(missingNote.status, 400);
    const invalid = await fetch(base, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "open" }) });
    assert.equal(invalid.status, 409);
    const resolved = await fetch(base, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "resolved", resolutionNote: "Reviewed and action taken." }) });
    assert.equal(resolved.status, 200);
    assert.deepEqual(await resolved.json(), { updated: true, status: "resolved" });
  } finally { await new Promise(resolve => server.close(resolve)); }
  assert.deepEqual(update.where, { id: "report-1", status: "open" });
  assert.equal(update.data.reviewedById, "moderator-a");
  assert.ok(update.data.reviewedAt instanceof Date);
  assert.equal(update.data.resolutionNote, "Reviewed and action taken.");
});

// Strict payloads and conditional updates prevent mass assignment and stale moderator decisions.
test("moderator decision rejects unknown fields and detects concurrent status changes", async () => {
  let update;
  const prisma = { contentReport: {
    findUnique: async () => ({ id: "report-1", status: "reviewing" }),
    updateMany: async args => { update = args; return { count: 0 }; }
  } };
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.userId = "moderator-a"; next(); });
  app.use("/api/social", createSocialRouter(prisma, ["moderator-a"]));
  app.use((error, _req, res, _next) => {
    if (error?.name === "ZodError") return res.status(400).json({ error: "Invalid request." });
    return res.status(500).json({ error: "Unexpected test error." });
  });
  const server = app.listen(0); await once(server, "listening");
  try {
    const base = "http://127.0.0.1:" + server.address().port + "/api/social/moderation/reports/report-1";
    const invalid = await fetch(base, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "resolved", resolutionNote: "Reviewed carefully.", reviewedById: "attacker" }) });
    assert.equal(invalid.status, 400);
    const stale = await fetch(base, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "resolved", resolutionNote: "Reviewed carefully." }) });
    assert.equal(stale.status, 409);
  } finally { await new Promise(resolve => server.close(resolve)); }
  assert.deepEqual(update.where, { id: "report-1", status: "reviewing" });
});


// Toggling off deletes only the signed-in user's reaction row.
test("POST reactions toggles the current reaction off without touching another account", async () => {
  let deleted;
  const prisma = {
    friendConnection: { findMany: async () => [] },
    userBlock: { findMany: async () => [] },
    feedPost: { findFirst: async args => {
      assert.deepEqual(args.where, { id: "post-a", OR: [{ userId: { in: ["user-a"] } }, { user: { privateAccount: false } }] });
      return { id: "post-a" };
    } },
    reaction: {
      findUnique: async () => ({ id: "reaction-a", userId: "user-a", postId: "post-a", value: "like" }),
      deleteMany: async args => { deleted = args; return { count: 1 }; }
    }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/posts/post-a/reactions", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: "like" })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { reaction: null, removed: true });
  });
  assert.deepEqual(deleted.where, { userId: "user-a", postId: "post-a", value: "like" });
});

// A new reaction value updates the existing per-user choice instead of creating a duplicate.
test("POST reactions changes the current account's selected reaction on a public post", async () => {
  let upserted;
  let notification;
  let visibilityQuery;
  const prisma = {
    friendConnection: { findMany: async () => [] },
    userBlock: { findMany: async () => [] },
    // No friendship exists here, so the public-profile branch must grant visibility.
    feedPost: { findFirst: async args => { visibilityQuery = args.where; return { id: "post-a", userId: "user-b" }; } },
    activityNotification: { create: async args => { notification = args.data; } },
    reaction: {
      findUnique: async () => ({ id: "reaction-a", userId: "user-a", postId: "post-a", value: "like" }),
      upsert: async args => { upserted = args; return { id: "reaction-a", userId: "user-a", postId: "post-a", value: "strong" }; }
    }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/posts/post-a/reactions", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: "strong" })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { reaction: { id: "reaction-a", userId: "user-a", postId: "post-a", value: "strong" }, removed: false });
  });
  assert.deepEqual(visibilityQuery, {
    id: "post-a",
    OR: [{ userId: { in: ["user-a"] } }, { user: { privateAccount: false } }]
  });
  assert.deepEqual(upserted.where, { userId_postId: { userId: "user-a", postId: "post-a" } });
  assert.deepEqual(upserted.update, { value: "strong" });
  assert.deepEqual(notification, { recipientId: "user-b", actorId: "user-a", postId: "post-a", type: "reaction" });
});

// A friend request creates an inbox item for the recipient, never for the sender.
test("POST friend requests records a notification for the requested account", async () => {
  let notification;
  const prisma = {
    user: { findUnique: async () => ({ id: "user-b" }) },
    userBlock: { findFirst: async () => null },
    friendConnection: {
      findFirst: async () => null,
      create: async ({ data }) => ({ id: "request-a", ...data, status: "pending" })
    },
    activityNotification: { create: async args => { notification = args.data; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/friends/request", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "friend-b" })
    });
    assert.equal(response.status, 201);
  });
  assert.deepEqual(notification, { recipientId: "user-b", actorId: "user-a", type: "friend_request" });
});

// Accepting a pending request notifies the original requester, not the accepting account.
test("POST friend request acceptance records a notification for the requester", async () => {
  let notification;
  const prisma = {
    friendConnection: {
      findFirst: async () => ({ requesterId: "user-b" }),
      updateMany: async () => ({ count: 1 })
    },
    activityNotification: { create: async args => { notification = args.data; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/friends/request-a/accept", { method: "POST" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { accepted: true });
  });
  assert.deepEqual(notification, { recipientId: "user-b", actorId: "user-a", type: "friend_accepted" });
});

// Commenting on another person's visible post creates an inbox item for that post owner.
test("POST comments records a notification for the post owner", async () => {
  let notification;
  const prisma = {
    friendConnection: { findMany: async () => [] },
    userBlock: { findMany: async () => [] },
    feedPost: { findFirst: async () => ({ id: "post-a", userId: "user-b" }) },
    feedComment: {
      create: async ({ data }) => ({ id: "comment-a", ...data, user: { id: "user-a", username: "tester" } })
    },
    activityNotification: { create: async args => { notification = args.data; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/posts/post-a/comments", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Nice work." })
    });
    assert.equal(response.status, 201);
  });
  assert.deepEqual(notification, { recipientId: "user-b", actorId: "user-a", postId: "post-a", type: "comment" });
});

// Reactions cannot be used to interact with hidden or inaccessible posts.
test("POST reactions rejects posts outside the current visible feed", async () => {
  let reads = 0;
  const prisma = {
    friendConnection: { findMany: async () => [] },
    userBlock: { findMany: async () => [] },
    feedPost: { findFirst: async () => null },
    reaction: { findUnique: async () => { reads += 1; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/posts/hidden-post/reactions", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: "like" })
    });
    assert.equal(response.status, 404);
  });
  assert.equal(reads, 0);
});


// The inbox returns only the signed-in recipient's notifications and hides blocked actors.
test("GET notifications is private, filters blocked actors and returns an unread count", async () => {
  let query;
  let countQuery;
  const rows = [{ id: "notice-a", type: "comment", actor: { id: "friend-b", username: "friend" } }];
  const prisma = {
    userBlock: { findMany: async () => [{ blockerId: "user-a", blockedUserId: "blocked-user" }] },
    activityNotification: {
      findMany: async args => { query = args; return rows; },
      count: async args => { countQuery = args; return 2; }
    }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/notifications?limit=10");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      notifications: rows, unreadCount: 2, hasMore: false, nextCursor: null
    });
  });
  assert.deepEqual(query.where, {
    recipientId: "user-a",
    OR: [{ actorId: null }, { actorId: { notIn: ["blocked-user"] } }]
  });
  assert.deepEqual(query.include.actor.select, { id: true, username: true, displayName: true });
  assert.deepEqual(countQuery.where, { ...query.where, readAt: null });
});

// Cursor paging asks Prisma for one extra row so the API can tell whether another page exists.
test("GET notifications applies a stable cursor and returns the next page boundary", async () => {
  let query;
  let countQuery;
  const rows = [
    { id: "notice-older-1", type: "reaction" },
    { id: "notice-older-2", type: "comment" },
    { id: "notice-extra", type: "friend_request" }
  ];
  const prisma = {
    userBlock: { findMany: async () => [] },
    activityNotification: {
      findMany: async args => { query = args; return rows; },
      count: async args => { countQuery = args; return 3; }
    }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/notifications?cursor=notice-cursor&limit=2");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      notifications: rows.slice(0, 2),
      unreadCount: 3,
      hasMore: true,
      nextCursor: "notice-older-2"
    });
  });
  assert.deepEqual(query.cursor, { id: "notice-cursor" });
  assert.equal(query.skip, 1);
  assert.equal(query.take, 3);
  assert.deepEqual(query.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.deepEqual(countQuery.where, { recipientId: "user-a", readAt: null });
});

// A notification ID is not authority; the recipient ID is part of the update condition.
test("PATCH notifications read only updates a notification owned by the authenticated account", async () => {
  let query;
  const prisma = {
    activityNotification: {
      updateMany: async args => { query = args; return { count: 1 }; }
    }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/notifications/notice-a/read", { method: "PATCH" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { read: true });
  });
  assert.deepEqual(query.where, { id: "notice-a", recipientId: "user-a", readAt: null });
  assert.ok(query.data.readAt instanceof Date);
});

// The bulk action uses one recipient-scoped write and cannot clear another account's inbox.
test("POST notifications read-all marks only unread notifications for the authenticated account", async () => {
  let query;
  const prisma = {
    activityNotification: {
      updateMany: async args => { query = args; return { count: 4 }; }
    }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/notifications/read-all", { method: "POST" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { updated: 4 });
  });
  assert.deepEqual(query.where, { recipientId: "user-a", readAt: null });
  assert.ok(query.data.readAt instanceof Date);
});


// Explore returns only public accounts and removes both directions of a block before pagination.
test("GET explore limits discovery to public, non-blocked accounts", async () => {
  let query;
  const prisma = {
    userBlock: { findMany: async () => [{ blockerId: "user-a", blockedUserId: "blocked-user" }, { blockerId: "other-user", blockedUserId: "user-a" }] },
    feedPost: { findMany: async args => { query = args; return [{ id: "public-post" }]; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/explore?limit=12");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { posts: [{ id: "public-post" }], hasMore: false, nextCursor: null });
  });
  assert.deepEqual(query.where, { userId: { not: "user-a", notIn: ["blocked-user", "other-user"] }, user: { privateAccount: false } });
  assert.equal(query.take, 13);
  assert.deepEqual(query.include.user.select, { id: true, username: true, displayName: true, bio: true });
});

// A malformed page size must fail before any public content is queried.
test("GET explore rejects invalid pagination", async () => {
  let reads = 0;
  const prisma = { userBlock: { findMany: async () => [], feedPost: { findMany: async () => { reads += 1; return []; } } } };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/explore?limit=100");
    assert.equal(response.status, 400);
  });
  assert.equal(reads, 0);
});


// Message requests store one introductory message and sort the pair so opposite-direction duplicates collide.
test("POST pings requests creates a pending conversation for the authenticated sender", async () => {
  let createArgs;
  const conversation = { id: "conversation-a", status: "pending" };
  const prisma = {
    userBlock: { findMany: async () => [] },
    user: { findUnique: async args => {
      assert.deepEqual(args, { where: { username: "runner" }, select: { id: true, username: true, displayName: true } });
      return { id: "user-b", username: "runner", displayName: "Runner" };
    } },
    directConversation: {
      findUnique: async args => { assert.deepEqual(args.where.userAId_userBId, { userAId: "user-a", userBId: "user-b" }); return null; },
      create: async args => { createArgs = args; return conversation; }
    }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/pings/requests", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "Runner", message: "Hello, I saw your training update." })
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { conversation });
  });
  assert.equal(createArgs.data.userAId, "user-a");
  assert.equal(createArgs.data.userBId, "user-b");
  assert.equal(createArgs.data.requesterId, "user-a");
  assert.equal(createArgs.data.status, "pending");
  assert.deepEqual(createArgs.data.messages, { create: { senderId: "user-a", body: "Hello, I saw your training update." } });
});

// Unknown, self and blocked recipients share the same response so the endpoint cannot be used to enumerate accounts.
test("POST pings requests hides unknown, self and blocked recipients", async () => {
  let creates = 0;
  const prisma = {
    userBlock: { findMany: async () => [{ blockerId: "user-a", blockedUserId: "user-b" }] },
    user: { findUnique: async ({ where }) => where.username === "missing" ? null : ({ id: where.username === "self" ? "user-a" : "user-b" }) },
    directConversation: { findUnique: async () => null, create: async () => { creates += 1; return {}; } }
  };
  await withSocialApi(prisma, async base => {
    for (const username of ["missing", "self", "blocked"]) {
      const response = await fetch(base + "/api/social/pings/requests", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, message: "Hello" })
      });
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "This member is unavailable for a message request." });
    }
  });
  assert.equal(creates, 0);
});

// A pair can have only one pending or accepted conversation, regardless of who tries to start it.
test("POST pings requests rejects an existing conversation without creating another", async () => {
  let creates = 0;
  const prisma = {
    userBlock: { findMany: async () => [] },
    user: { findUnique: async () => ({ id: "user-b" }) },
    directConversation: {
      findUnique: async () => ({ id: "conversation-a", status: "pending" }),
      create: async () => { creates += 1; return {}; }
    }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/pings/requests", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "runner", message: "Hello" })
    });
    assert.equal(response.status, 409);
  });
  assert.equal(creates, 0);
});

// Incoming requests exclude the signed-in sender and both directions of a block before pagination.
test("GET pings requests returns only incoming unblocked requests", async () => {
  let query;
  const prisma = {
    userBlock: { findMany: async () => [{ blockerId: "user-a", blockedUserId: "user-c" }] },
    directConversation: { findMany: async args => { query = args; return [{ id: "request-a" }]; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/pings/requests?limit=5");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { requests: [{ id: "request-a" }], hasMore: false, nextCursor: null });
  });
  assert.deepEqual(query.where, {
    status: "pending", requesterId: { not: "user-a" },
    OR: [{ userAId: "user-a" }, { userBId: "user-a" }],
    AND: [{ userAId: { notIn: ["user-c"] } }, { userBId: { notIn: ["user-c"] } }]
  });
  assert.equal(query.take, 6);
});

// Only the recipient can accept a pending request; requester IDs are not sufficient authority.
test("POST pings accept is restricted to the recipient", async () => {
  let query;
  let reads = 0;
  const prisma = {
    userBlock: { findMany: async () => [] },
    directConversation: {
      updateMany: async args => { query = args; return { count: 1 }; },
      findUnique: async () => { reads += 1; return { id: "conversation-a", status: "accepted" }; }
    }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/pings/requests/conversation-a/accept", { method: "POST" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { conversation: { id: "conversation-a", status: "accepted" } });
  });
  assert.equal(query.where.requesterId.not, "user-a");
  assert.equal(query.where.status, "pending");
  assert.deepEqual(query.data, { status: "accepted" });
  assert.equal(reads, 1);
});

// Declining a request deletes its introductory text but retains a declined pair record to stop repeated contact.
test("POST pings decline removes the introduction and retains the declined request", async () => {
  let updateQuery;
  let deleteQuery;
  const prisma = {
    directConversation: { updateMany: async args => { updateQuery = args; return { count: 1 }; } },
    directMessage: { deleteMany: async args => { deleteQuery = args; return { count: 1 }; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/pings/requests/conversation-a/decline", { method: "POST" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { declined: true });
  });
  assert.equal(updateQuery.where.requesterId.not, "user-a");
  assert.deepEqual(updateQuery.data, { status: "declined" });
  assert.deepEqual(deleteQuery.where, { conversationId: "conversation-a" });
});

// Message history is available only to a participant and uses a bounded, stable cursor.
test("GET pings messages checks participant access before reading history", async () => {
  let conversationQuery;
  let messageQuery;
  const rows = [{ id: "message-a" }];
  const prisma = {
    userBlock: { findMany: async () => [] },
    directConversation: { findFirst: async args => { conversationQuery = args; return { id: "conversation-a" }; } },
    directMessage: { findMany: async args => { messageQuery = args; return rows; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/pings/conversations/conversation-a/messages?limit=10");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { messages: rows, hasMore: false, nextCursor: null });
  });
  assert.deepEqual(conversationQuery.where.OR, [{ userAId: "user-a" }, { userBId: "user-a" }]);
  assert.deepEqual(conversationQuery.where.status, { in: ["accepted", "pending"] });
  assert.equal(messageQuery.take, 11);
  assert.deepEqual(messageQuery.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
});

// A user cannot send a message until the other participant has accepted the request.
test("POST pings messages rejects pending and blocked conversations", async () => {
  let creates = 0;
  const prisma = {
    userBlock: { findMany: async () => [] },
    directConversation: { findFirst: async () => null },
    directMessage: { create: async () => { creates += 1; return {}; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/pings/conversations/conversation-a/messages", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Reply" })
    });
    assert.equal(response.status, 404);
  });
  assert.equal(creates, 0);
});

// Accepted participants can send a bounded message; the conversation ordering follows its newest message.
test("POST pings messages stores the authenticated sender and updates last activity", async () => {
  let createArgs;
  let updateArgs;
  const createdAt = new Date("2026-11-09T20:00:00.000Z");
  const message = { id: "message-a", createdAt, body: "Thanks for reaching out." };
  const prisma = {
    userBlock: { findMany: async () => [] },
    directConversation: { findFirst: async () => ({ id: "conversation-a" }), update: async args => { updateArgs = args; return {}; } },
    directMessage: { create: async args => { createArgs = args; return message; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/pings/conversations/conversation-a/messages", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "  Thanks for reaching out.  " })
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), JSON.parse(JSON.stringify({ message })));
  });
  assert.deepEqual(createArgs.data, { conversationId: "conversation-a", senderId: "user-a", body: "Thanks for reaching out." });
  assert.deepEqual(updateArgs, { where: { id: "conversation-a" }, data: { lastMessageAt: createdAt } });
});

// Read receipts only update unread messages from the other participant in this conversation.
test("PATCH pings read updates only incoming unread messages", async () => {
  let query;
  const prisma = {
    userBlock: { findMany: async () => [] },
    directConversation: { findFirst: async () => ({ id: "conversation-a" }) },
    directMessage: { updateMany: async args => { query = args; return { count: 2 }; } }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/pings/conversations/conversation-a/read", { method: "PATCH" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { read: 2 });
  });
  assert.deepEqual(query.where, { conversationId: "conversation-a", senderId: { not: "user-a" }, readAt: null });
  assert.ok(query.data.readAt instanceof Date);
});


// A private profile cannot be contacted through username guessing; an accepted friendship is required first.
test("POST pings requests respects private profile visibility", async () => {
  let conversationLookups = 0;
  const prisma = {
    userBlock: { findMany: async () => [] },
    user: { findUnique: async () => ({ id: "user-b", username: "private-runner", privateAccount: true }) },
    friendConnection: { findFirst: async () => null },
    directConversation: { findUnique: async () => { conversationLookups += 1; return null; }, create: async () => ({}) }
  };
  await withSocialApi(prisma, async base => {
    const response = await fetch(base + "/api/social/pings/requests", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "private-runner", message: "Hello" })
    });
    assert.equal(response.status, 404);
  });
  assert.equal(conversationLookups, 0);
});
