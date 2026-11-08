-- AI-generated coaching is optional and must be enabled by the account owner.
-- Existing accounts receive false, so this migration never silently opts anyone into external processing.
ALTER TABLE "CoachPreference" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT false;
