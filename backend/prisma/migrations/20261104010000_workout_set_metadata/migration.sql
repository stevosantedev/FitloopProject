-- Preserve existing sets while adding optional coaching and rest metadata.
ALTER TABLE "WorkoutSet"
  ADD COLUMN "setType" TEXT NOT NULL DEFAULT 'working',
  ADD COLUMN "restSeconds" INTEGER,
  ADD COLUMN "rir" INTEGER,
  ADD COLUMN "rpe" DOUBLE PRECISION;
