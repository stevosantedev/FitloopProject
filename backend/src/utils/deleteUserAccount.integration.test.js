import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../prisma.js";
import { deleteUserAccount } from "./deleteUserAccount.js";

test("account deletion removes owned records and private exercises while preserving shared data", {
  skip: !process.env.DATABASE_URL
}, async () => {
  const suffix = randomUUID();
  const ownerId = "delete-owner-" + suffix;
  const friendId = "delete-friend-" + suffix;
  let sharedExerciseId;
  let privateExerciseId;

  try {
    const owner = await prisma.user.create({
      data: {
        id: ownerId,
        username: "delete_owner_" + suffix.slice(0, 8),
        email: "delete-owner-" + suffix + "@example.test",
        passwordHash: "test-only-hash"
      }
    });
    const friend = await prisma.user.create({
      data: {
        id: friendId,
        username: "delete_friend_" + suffix.slice(0, 8),
        email: "delete-friend-" + suffix + "@example.test",
        passwordHash: "test-only-hash"
      }
    });

    const sharedExercise = await prisma.exercise.create({
      data: { name: "Shared deletion fixture " + suffix, muscleGroup: "Test", isCustom: false }
    });
    sharedExerciseId = sharedExercise.id;

    const privateExercise = await prisma.exercise.create({
      data: {
        name: "Private deletion fixture " + suffix,
        muscleGroup: "Test",
        isCustom: true,
        ownerId: owner.id
      }
    });
    privateExerciseId = privateExercise.id;

    const routine = await prisma.workoutRoutine.create({
      data: {
        userId: owner.id,
        name: "Deletion fixture routine",
        exercises: {
          create: [{
            sortOrder: 0,
            exercise: { connect: { id: privateExercise.id } }
          }]
        }
      }
    });

    const session = await prisma.workoutSession.create({
      data: {
        userId: owner.id,
        routineId: routine.id,
        endedAt: new Date(),
        sets: {
          create: [{
            setNumber: 1,
            reps: 8,
            completed: true,
            exercise: { connect: { id: privateExercise.id } }
          }]
        }
      }
    });

    const post = await prisma.feedPost.create({
      data: { userId: owner.id, type: "update", text: "Deletion fixture post" }
    });
    await prisma.coachConversation.create({
      data: {
        userId: owner.id,
        title: "Deletion fixture conversation",
        messages: { create: [
          { role: "user", content: "How is my training going?" },
          { role: "assistant", content: "Let's review your logged sessions." }
        ] }
      }
    });

    await Promise.all([
      prisma.dailyLog.create({
        data: { userId: owner.id, date: new Date("2026-01-01T00:00:00.000Z"), mood: 3 }
      }),
      prisma.plannedSession.create({
        data: { userId: owner.id, routineId: routine.id, sessionId: session.id, scheduledAt: new Date() }
      }),
      prisma.coachEvent.create({
        data: { userId: owner.id, ruleCode: "TEST", message: "Test", explanation: "Deletion fixture" }
      }),
      prisma.coachPreference.create({ data: { userId: owner.id } }),
      prisma.friendConnection.create({
        data: { requesterId: owner.id, addresseeId: friend.id, status: "accepted" }
      }),
      prisma.reaction.create({ data: { userId: owner.id, postId: post.id, value: "like" } }),
      prisma.feedComment.create({ data: { userId: owner.id, postId: post.id, text: "Deletion fixture comment" } })
    ]);

    await deleteUserAccount(prisma, owner.id);

    const [
      deletedUser,
      dailyLogs,
      routines,
      sessions,
      plannedSessions,
      coachEvents,
      coachPreferences,
      coachConversations,
      coachMessages,
      posts,
      friendships,
      reactions,
      comments,
      privateExercises,
      sharedExerciseAfterDeletion,
      survivingFriend
    ] = await Promise.all([
      prisma.user.findUnique({ where: { id: owner.id } }),
      prisma.dailyLog.count({ where: { userId: owner.id } }),
      prisma.workoutRoutine.count({ where: { userId: owner.id } }),
      prisma.workoutSession.count({ where: { userId: owner.id } }),
      prisma.plannedSession.count({ where: { userId: owner.id } }),
      prisma.coachEvent.count({ where: { userId: owner.id } }),
      prisma.coachPreference.count({ where: { userId: owner.id } }),
      prisma.coachConversation.count({ where: { userId: owner.id } }),
      prisma.coachMessage.count({ where: { conversation: { userId: owner.id } } }),
      prisma.feedPost.count({ where: { userId: owner.id } }),
      prisma.friendConnection.count({ where: { OR: [{ requesterId: owner.id }, { addresseeId: owner.id }] } }),
      prisma.reaction.count({ where: { userId: owner.id } }),
      prisma.feedComment.count({ where: { userId: owner.id } }),
      prisma.exercise.count({ where: { id: privateExercise.id } }),
      prisma.exercise.count({ where: { id: sharedExercise.id } }),
      prisma.user.findUnique({ where: { id: friend.id } })
    ]);

    assert.equal(deletedUser, null);
    for (const count of [dailyLogs, routines, sessions, plannedSessions, coachEvents, coachPreferences, coachConversations, coachMessages, posts, friendships, reactions, comments, privateExercises]) {
      assert.equal(count, 0);
    }
    assert.equal(sharedExerciseAfterDeletion, 1);
    assert.ok(survivingFriend);
  } finally {
    // Keep the disposable test database clean even if an assertion exposes a regression.
    await prisma.workoutSession.deleteMany({ where: { userId: ownerId } });
    await prisma.workoutRoutine.deleteMany({ where: { userId: ownerId } });
    if (privateExerciseId) await prisma.exercise.deleteMany({ where: { id: privateExerciseId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.user.deleteMany({ where: { id: friendId } });
    if (sharedExerciseId) await prisma.exercise.deleteMany({ where: { id: sharedExerciseId } });
  }
});
