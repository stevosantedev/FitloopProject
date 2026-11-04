-- Add a stable client-generated key so a queued workout can be retried safely.
-- PostgreSQL permits multiple NULL values in a unique index, preserving compatibility
-- with sessions created by older clients that do not send an idempotency key.
ALTER TABLE "WorkoutSession"
ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "WorkoutSession_clientRequestId_key"
ON "WorkoutSession"("clientRequestId");
