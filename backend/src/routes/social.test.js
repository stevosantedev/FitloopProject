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
  assert.deepEqual(query.select, { id: true, username: true, displayName: true, bio: true });
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
    friendConnection: { findFirst: async () => null }
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
    } }
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
    friendConnection: { findFirst: async () => { throw new Error("Public profiles do not need a friendship query."); } }
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
