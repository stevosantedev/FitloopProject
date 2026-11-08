import test from "node:test";
import assert from "node:assert/strict";
import { deleteUserAccount } from "./deleteUserAccount.js";

// This order mirrors the foreign-key restriction: session history must be removed before private exercises.
test("account deletion removes restricted training dependants before custom exercises", async () => {
  const calls = [];
  let transactionCount = 0;
  const transaction = {
    workoutSession: { deleteMany: async (args) => calls.push(["sessions", args]) },
    workoutRoutine: { deleteMany: async (args) => calls.push(["routines", args]) },
    exercise: { deleteMany: async (args) => calls.push(["exercises", args]) },
    user: { delete: async (args) => calls.push(["user", args]) }
  };
  const prisma = {
    $transaction: async (callback) => {
      transactionCount += 1;
      return callback(transaction);
    }
  };

  await deleteUserAccount(prisma, "account-123");

  assert.equal(transactionCount, 1);
  assert.deepEqual(calls, [
    ["sessions", { where: { userId: "account-123" } }],
    ["routines", { where: { userId: "account-123" } }],
    ["exercises", { where: { ownerId: "account-123", isCustom: true } }],
    ["user", { where: { id: "account-123" } }]
  ]);
});

// A failed database operation must stop later deletes so the surrounding transaction can roll back.
test("account deletion propagates failures so the transaction can roll back", async () => {
  const failure = new Error("database unavailable");
  const prisma = {
    $transaction: async (callback) => callback({
      workoutSession: { deleteMany: async () => { throw failure; } },
      workoutRoutine: { deleteMany: async () => assert.fail("routine deletion must not run") },
      exercise: { deleteMany: async () => assert.fail("exercise deletion must not run") },
      user: { delete: async () => assert.fail("user deletion must not run") }
    })
  };

  await assert.rejects(deleteUserAccount(prisma, "account-123"), failure);
});
