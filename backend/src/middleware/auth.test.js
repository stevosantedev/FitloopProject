import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { once } from "node:events";
import { createAuthMiddleware } from "./auth.js";

const secret = "test-only-secret-that-is-long-enough-for-hmac";
const token = (claims = {}, options = {}) => jwt.sign(claims, secret, {
  subject: "account-1", issuer: "fitloop-api", audience: "fitloop-web",
  algorithm: "HS256", expiresIn: "2h", ...options
});

async function requestWithToken(value, header = true) {
  const app = express();
  app.get("/private", createAuthMiddleware(secret), (req, res) => res.json({ userId: req.userId }));
  const server = app.listen(0);
  await once(server, "listening");
  try {
    const headers = header ? { authorization: `Bearer ${value}` } : {};
    return await fetch(`http://127.0.0.1:${server.address().port}/private`, { headers });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("accepts a token with the expected signature, issuer and audience", async () => {
  const response = await requestWithToken(token());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { userId: "account-1" });
});

test("rejects a token signed with a different algorithm", async () => {
  const response = await requestWithToken(jwt.sign({ sub: "account-1" }, secret, { algorithm: "HS384", issuer: "fitloop-api", audience: "fitloop-web" }));
  assert.equal(response.status, 401);
});

test("rejects a token issued for another service", async () => {
  const response = await requestWithToken(token({}, { issuer: "another-api" }));
  assert.equal(response.status, 401);
});

test("rejects a token intended for another audience", async () => {
  const response = await requestWithToken(token({}, { audience: "another-client" }));
  assert.equal(response.status, 401);
});

test("rejects expired tokens and missing bearer credentials", async () => {
  const expired = token({}, { expiresIn: -1 });
  assert.equal((await requestWithToken(expired)).status, 401);
  assert.equal((await requestWithToken("", false)).status, 401);
});

test("rejects a signed token without an account subject", async () => {
  const withoutSubject = jwt.sign({}, secret, { issuer: "fitloop-api", audience: "fitloop-web", algorithm: "HS256" });
  assert.equal((await requestWithToken(withoutSubject)).status, 401);
});
