-- Add account-owned weekly training programmes without changing existing routine/session records.
CREATE TABLE "TrainingPlan" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "goal" TEXT NOT NULL,
  "daysPerWeek" INTEGER NOT NULL,
  "experience" TEXT NOT NULL,
  "equipment" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingPlanDay" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "dayNumber" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "routineId" TEXT NOT NULL,
  CONSTRAINT "TrainingPlanDay_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrainingPlan_userId_updatedAt_idx" ON "TrainingPlan"("userId", "updatedAt");
CREATE UNIQUE INDEX "TrainingPlanDay_planId_dayNumber_key" ON "TrainingPlanDay"("planId", "dayNumber");
CREATE INDEX "TrainingPlanDay_routineId_idx" ON "TrainingPlanDay"("routineId");

ALTER TABLE "TrainingPlan" ADD CONSTRAINT "TrainingPlan_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingPlanDay" ADD CONSTRAINT "TrainingPlanDay_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "TrainingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingPlanDay" ADD CONSTRAINT "TrainingPlanDay_routineId_fkey"
  FOREIGN KEY ("routineId") REFERENCES "WorkoutRoutine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
