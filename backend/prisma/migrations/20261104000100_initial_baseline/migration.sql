-- Initial schema baseline for the FitLoop PostgreSQL database.
-- This migration creates the complete current data model from an empty database.
-- IDs with Prisma cuid() defaults are supplied by the Prisma client, not PostgreSQL.

CREATE TYPE "MuscleRole" AS ENUM ('PRIMARY', 'SECONDARY');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'energy',
  "privateAccount" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "sleepMinutes" INTEGER,
  "bedtime" TIMESTAMP(3),
  "wakeTime" TIMESTAMP(3),
  "steps" INTEGER,
  "activityMinutes" INTEGER,
  "mood" INTEGER,
  "focusMinutes" INTEGER,
  "note" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Exercise" (
  "id" TEXT NOT NULL,
  "slug" TEXT,
  "name" TEXT NOT NULL,
  "muscleGroup" TEXT NOT NULL,
  "equipment" TEXT,
  "description" TEXT,
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "instructions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "coachingCues" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "equipmentAlternatives" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "category" TEXT,
  "movementPattern" TEXT,
  "bodyRegion" TEXT,
  "difficulty" TEXT,
  "mediaUrl" TEXT,
  "mediaSource" TEXT,
  "mediaLicense" TEXT,
  "isCustom" BOOLEAN NOT NULL DEFAULT false,
  "ownerId" TEXT,
  CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Muscle" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "bodyRegion" TEXT NOT NULL,
  "view" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "Muscle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkoutRoutine" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkoutRoutine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoutineExercise" (
  "id" TEXT NOT NULL,
  "routineId" TEXT NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "RoutineExercise_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkoutSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "routineId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "notes" TEXT,
  CONSTRAINT "WorkoutSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkoutSet" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "setNumber" INTEGER NOT NULL,
  "reps" INTEGER NOT NULL,
  "weightKg" DOUBLE PRECISION,
  "completed" BOOLEAN NOT NULL DEFAULT true,
  "setType" TEXT NOT NULL DEFAULT 'working',
  "restSeconds" INTEGER,
  "rir" INTEGER,
  "rpe" DOUBLE PRECISION,
  CONSTRAINT "WorkoutSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlannedSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "routineId" TEXT,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "sessionId" TEXT,
  CONSTRAINT "PlannedSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoachEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "ruleCode" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "explanation" TEXT NOT NULL,
  "metric" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decision" TEXT NOT NULL DEFAULT 'pending',
  CONSTRAINT "CoachEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoachPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "style" TEXT NOT NULL DEFAULT 'gentle',
  "focus" TEXT NOT NULL DEFAULT 'energy',
  CONSTRAINT "CoachPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedPost" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "text" TEXT,
  "sessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FriendConnection" (
  "id" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "addresseeId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FriendConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Reaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "value" TEXT NOT NULL DEFAULT 'like',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedComment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "text" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExerciseMuscle" (
  "exerciseId" TEXT NOT NULL,
  "muscleId" TEXT NOT NULL,
  "role" "MuscleRole" NOT NULL DEFAULT 'PRIMARY',
  CONSTRAINT "ExerciseMuscle_pkey" PRIMARY KEY ("exerciseId", "muscleId")
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "DailyLog_userId_date_key" ON "DailyLog"("userId", "date");
CREATE INDEX "DailyLog_userId_date_idx" ON "DailyLog"("userId", "date");
CREATE UNIQUE INDEX "Exercise_slug_key" ON "Exercise"("slug");
CREATE INDEX "Exercise_isCustom_name_idx" ON "Exercise"("isCustom", "name");
CREATE INDEX "Exercise_ownerId_idx" ON "Exercise"("ownerId");
CREATE UNIQUE INDEX "Muscle_slug_key" ON "Muscle"("slug");
CREATE INDEX "Muscle_bodyRegion_sortOrder_idx" ON "Muscle"("bodyRegion", "sortOrder");
CREATE UNIQUE INDEX "RoutineExercise_routineId_exerciseId_key" ON "RoutineExercise"("routineId", "exerciseId");
CREATE INDEX "WorkoutSet_sessionId_idx" ON "WorkoutSet"("sessionId");
CREATE UNIQUE INDEX "PlannedSession_sessionId_key" ON "PlannedSession"("sessionId");
CREATE INDEX "PlannedSession_userId_scheduledAt_status_idx" ON "PlannedSession"("userId", "scheduledAt", "status");
CREATE INDEX "CoachEvent_userId_createdAt_idx" ON "CoachEvent"("userId", "createdAt");
CREATE UNIQUE INDEX "CoachPreference_userId_key" ON "CoachPreference"("userId");
CREATE UNIQUE INDEX "FeedPost_sessionId_key" ON "FeedPost"("sessionId");
CREATE INDEX "FeedPost_userId_createdAt_idx" ON "FeedPost"("userId", "createdAt");
CREATE UNIQUE INDEX "FriendConnection_requesterId_addresseeId_key" ON "FriendConnection"("requesterId", "addresseeId");
CREATE UNIQUE INDEX "Reaction_userId_postId_key" ON "Reaction"("userId", "postId");
CREATE INDEX "FeedComment_postId_createdAt_idx" ON "FeedComment"("postId", "createdAt");
CREATE INDEX "ExerciseMuscle_muscleId_role_idx" ON "ExerciseMuscle"("muscleId", "role");

ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutRoutine" ADD CONSTRAINT "WorkoutRoutine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutineExercise" ADD CONSTRAINT "RoutineExercise_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "WorkoutRoutine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutineExercise" ADD CONSTRAINT "RoutineExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "WorkoutRoutine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlannedSession" ADD CONSTRAINT "PlannedSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlannedSession" ADD CONSTRAINT "PlannedSession_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "WorkoutRoutine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlannedSession" ADD CONSTRAINT "PlannedSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoachEvent" ADD CONSTRAINT "CoachEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachPreference" ADD CONSTRAINT "CoachPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkoutSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FriendConnection" ADD CONSTRAINT "FriendConnection_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FriendConnection" ADD CONSTRAINT "FriendConnection_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedComment" ADD CONSTRAINT "FeedComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExerciseMuscle" ADD CONSTRAINT "ExerciseMuscle_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExerciseMuscle" ADD CONSTRAINT "ExerciseMuscle_muscleId_fkey" FOREIGN KEY ("muscleId") REFERENCES "Muscle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
