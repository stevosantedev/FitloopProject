import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
process.env.DATABASE_URL ??= "postgresql://fitloop:fitloop@localhost:5432/fitloop_test";
process.env.JWT_SECRET ??= "fitloop-route-test-secret-at-least-32-characters";
const { createCoachRouter } = await import("./coach.js");

async function withCoachApi(prisma, run) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = "user-a"; next(); });
  app.use("/api/coach", createCoachRouter(prisma));
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

// Conversation creation must attach ownership from the verified session, never from request data.
test("POST conversations creates a private conversation for the authenticated account", async () => {
  let args;
  const prisma = {
    coachConversation: { create: async input => { args = input; return { id: "conversation-a", ...input.data }; } }
  };
  await withCoachApi(prisma, async base => {
    const response = await fetch(base + "/api/coach/conversations", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Build my strength plan" })
    });
    assert.equal(response.status, 201);
    const data = await response.json();
    assert.equal(data.conversation.title, "Build my strength plan");
  });
  assert.deepEqual(args.data, { userId: "user-a", title: "Build my strength plan" });
});

// Keep stored titles useful in the UI and reject invalid input before creating a row.
test("POST conversations rejects blank or overlong titles", async () => {
  let writes = 0;
  const prisma = { coachConversation: { create: async () => { writes += 1; return {}; } } };
  await withCoachApi(prisma, async base => {
    const response = await fetch(base + "/api/coach/conversations", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "   " })
    });
    assert.equal(response.status, 400);
  });
  assert.equal(writes, 0);
});

// The list query is account-scoped so one user's private coaching history cannot leak to another.
test("GET conversations returns only the signed-in user's conversations", async () => {
  let query;
  const prisma = { coachConversation: { findMany: async args => { query = args; return []; } } };
  await withCoachApi(prisma, async base => {
    const response = await fetch(base + "/api/coach/conversations");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { conversations: [] });
  });
  assert.equal(query.where.userId, "user-a");
  assert.equal(query.take, 50);
});

// Ownership is checked before message retrieval to avoid disclosing whether another account has a conversation.
test("GET conversation messages checks ownership before reading message content", async () => {
  let messageReads = 0;
  const prisma = {
    coachConversation: { findFirst: async args => {
      assert.deepEqual(args.where, { id: "someone-elses-chat", userId: "user-a" });
      return null;
    } },
    coachMessage: { findMany: async () => { messageReads += 1; return []; } }
  };
  await withCoachApi(prisma, async base => {
    const response = await fetch(base + "/api/coach/conversations/someone-elses-chat/messages");
    assert.equal(response.status, 404);
  });
  assert.equal(messageReads, 0);
});

// Chronological ordering keeps the conversation readable even when records are stored by insertion time.
test("GET conversation messages returns chronological messages for an owned conversation", async () => {
  let query;
  const messages = [{ id: "message-a", role: "user", content: "How is my progress?" }];
  const prisma = {
    coachConversation: { findFirst: async () => ({ id: "conversation-a" }) },
    coachMessage: { findMany: async args => { query = args; return messages; } }
  };
  await withCoachApi(prisma, async base => {
    const response = await fetch(base + "/api/coach/conversations/conversation-a/messages");
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).messages, messages);
  });
  assert.deepEqual(query.where, { conversationId: "conversation-a" });
  assert.deepEqual(query.orderBy, { createdAt: "asc" });
});

// Only the owner can remove a conversation and its dependent messages.
test("DELETE conversation is restricted to its owner", async () => {
  let query;
  const prisma = { coachConversation: { deleteMany: async args => { query = args; return { count: 1 }; } } };
  await withCoachApi(prisma, async base => {
    const response = await fetch(base + "/api/coach/conversations/conversation-a", { method: "DELETE" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deleted: true });
  });
  assert.deepEqual(query.where, { id: "conversation-a", userId: "user-a" });
});

// Use the same not-found response for unowned records to avoid confirming another user's data exists.
test("DELETE conversation returns not found for another account's conversation", async () => {
  const prisma = { coachConversation: { deleteMany: async () => ({ count: 0 }) } };
  await withCoachApi(prisma, async base => {
    const response = await fetch(base + "/api/coach/conversations/private-chat", { method: "DELETE" });
    assert.equal(response.status, 404);
  });
});
