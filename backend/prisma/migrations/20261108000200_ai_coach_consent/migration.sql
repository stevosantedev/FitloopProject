-- AI-generated coaching is optional and must be enabled by the account owner.
ALTER TABLE "CoachPreference" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT false;
