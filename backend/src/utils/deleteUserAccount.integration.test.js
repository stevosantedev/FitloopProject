import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../prisma.js";
import { deleteUserAccount } from "./deleteUserAccount.js";

// Use the real database constraints to verify deletion beyond the mocked transaction-order tests.
test("account deletion removes owned records and private exercises while preserving shared data", {
  skip: !process.env.DATABASE_URL
}, async () => {
  const suffix = randomUUID();
  const ownerId = "delete-owner-" + suffix;
  const friendId = "delete-friend-" + suffix;
  let sharedExerciseId;
  let privateExerciseId;

  try {
    // Separate owner and friend records prove deletion is scoped to one account, not the whole social graph.
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

    // Keep one shared catalogue entry and one owner-only custom exercise to check both deletion rules.
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

    // The routine and session deliberately reference the private exercise to exercise the foreign-key cascade order.
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

    // Plan days point at the same routine so the test also checks programme-to-routine cleanup.
    await prisma.trainingPlan.create({
      data: {
        userId: owner.id, name: "Deletion fixture plan", goal: "general", daysPerWeek: 2,
        experience: "beginner", equipment: "bodyweight",
        days: { create: [
          { dayNumber: 1, label: "Day one", routineId: routine.id },
          { dayNumber: 2, label: "Day two", routineId: routine.id }
        ] }
      }
    });

    // Social posts and Coach conversations must disappear with their owner, including dependent messages.
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

    // Add records across every account-owned feature plus cross-account reports and blocks.
    // The friend's records must survive, with references to the deleted account anonymised.
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
      prisma.feedComment.create({ data: { userId: owner.id, postId: post.id, text: "Deletion fixture comment" } }),
      prisma.userBlock.create({ data: { blockerId: owner.id, blockedUserId: friend.id } }),
      prisma.userBlock.create({ data: { blockerId: friend.id, blockedUserId: owner.id } }),
      prisma.contentReport.create({
        data: {
          reporterId: owner.id,
          reportedUserId: friend.id,
          reason: "spam"
        }
      }),
      prisma.contentReport.create({
        data: {
          reporterId: friend.id,
          reportedUserId: owner.id,
          reason: "harassment"
        }
      }),
      prisma.contentReport.create({
        data: {
          reporterId: friend.id,
          reportedUserId: owner.id,
          postId: post.id,
          reason: "other",
          details: "Report against the owner's post"
        }
      })
    ]);

    // Exercise the production deletion helper rather than manually reproducing its delete sequence.
    await deleteUserAccount(prisma, owner.id);

    // Read back every dependent table so a missing cascade cannot be hidden by a successful delete response.
    const [
      deletedUser,
      dailyLogs,
      routines,
      sessions,
      plannedSessions,
      trainingPlans,
      trainingPlanDays,
      coachEvents,
      coachPreferences,
      coachConversations,
      coachMessages,
      posts,
      friendships,
      reactions,
      comments,
      blocksInvolvingOwner,
      reportsFiledByOwner,
      survivingFriendReports,
      privateExercises,
      sharedExerciseAfterDeletion,
      survivingFriend
    ] = await Promise.all([
      prisma.user.findUnique({ where: { id: owner.id } }),
      prisma.dailyLog.count({ where: { userId: owner.id } }),
      prisma.workoutRoutine.count({ where: { userId: owner.id } }),
      prisma.workoutSession.count({ where: { userId: owner.id } }),
      prisma.plannedSession.count({ where: { userId: owner.id } }),
      prisma.trainingPlan.count({ where: { userId: owner.id } }),
      prisma.trainingPlanDay.count({ where: { plan: { is: { userId: owner.id } } } }),
      prisma.coachEvent.count({ where: { userId: owner.id } }),
      prisma.coachPreference.count({ where: { userId: owner.id } }),
      prisma.coachConversation.count({ where: { userId: owner.id } }),
      prisma.coachMessage.count({ where: { conversation: { userId: owner.id } } }),
      prisma.feedPost.count({ where: { userId: owner.id } }),
      prisma.friendConnection.count({ where: { OR: [{ requesterId: owner.id }, { addresseeId: owner.id }] } }),
      prisma.reaction.count({ where: { userId: owner.id } }),
      prisma.feedComment.count({ where: { userId: owner.id } }),
      prisma.userBlock.count({
        where: { OR: [{ blockerId: owner.id }, { blockedUserId: owner.id }] }
      }),
      prisma.contentReport.count({ where: { reporterId: owner.id } }),
      prisma.contentReport.findMany({
        where: { reporterId: friend.id },
        select: { reportedUserId: true, postId: true, reason: true }
      }),
      prisma.exercise.count({ where: { id: privateExercise.id } }),
      prisma.exercise.count({ where: { id: sharedExercise.id } }),
      prisma.user.findUnique({ where: { id: friend.id } })
    ]);

    // The owner and private data disappear, while shared catalogue entries and unrelated users remain.
    assert.equal(deletedUser, null);
    for (const count of [
      dailyLogs, routines, sessions, plannedSessions, trainingPlans, trainingPlanDays, coachEvents, coachPreferences,
      coachConversations, coachMessages, posts, friendships, reactions, comments,
      blocksInvolvingOwner, reportsFiledByOwner, privateExercises
    ]) {
      assert.equal(count, 0);
    }
    // Reports filed by the surviving friend remain, but references to the deleted user/post are cleared.
    assert.equal(survivingFriendReports.length, 2);
    assert.ok(survivingFriendReports.every(report => report.reportedUserId === null));
    assert.ok(survivingFriendReports.every(report => report.postId === null));
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
