-- Expand exercise definitions and add the canonical muscle relationship.
-- Existing catalogue rows remain valid; new descriptive fields are nullable or
-- have empty-array defaults so the migration does not invent missing metadata.
CREATE TYPE "MuscleRole" AS ENUM ('PRIMARY', 'SECONDARY');

ALTER TABLE "Exercise"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "instructions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "coachingCues" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "equipmentAlternatives" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "category" TEXT,
  ADD COLUMN "movementPattern" TEXT,
  ADD COLUMN "bodyRegion" TEXT,
  ADD COLUMN "difficulty" TEXT,
  ADD COLUMN "mediaUrl" TEXT,
  ADD COLUMN "mediaSource" TEXT,
  ADD COLUMN "mediaLicense" TEXT,
  ADD COLUMN "ownerId" TEXT;

CREATE UNIQUE INDEX "Exercise_slug_key" ON "Exercise"("slug");
CREATE INDEX "Exercise_isCustom_name_idx" ON "Exercise"("isCustom", "name");
CREATE INDEX "Exercise_ownerId_idx" ON "Exercise"("ownerId");
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Muscle" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "bodyRegion" TEXT NOT NULL,
  "view" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "Muscle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Muscle_slug_key" ON "Muscle"("slug");
CREATE INDEX "Muscle_bodyRegion_sortOrder_idx" ON "Muscle"("bodyRegion", "sortOrder");

CREATE TABLE "ExerciseMuscle" (
  "exerciseId" TEXT NOT NULL,
  "muscleId" TEXT NOT NULL,
  "role" "MuscleRole" NOT NULL DEFAULT 'PRIMARY',
  CONSTRAINT "ExerciseMuscle_pkey" PRIMARY KEY ("exerciseId", "muscleId")
);
CREATE INDEX "ExerciseMuscle_muscleId_role_idx" ON "ExerciseMuscle"("muscleId", "role");
ALTER TABLE "ExerciseMuscle" ADD CONSTRAINT "ExerciseMuscle_exerciseId_fkey"
  FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExerciseMuscle" ADD CONSTRAINT "ExerciseMuscle_muscleId_fkey"
  FOREIGN KEY ("muscleId") REFERENCES "Muscle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
