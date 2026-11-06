-- Minimal social profile fields. Email and credentials remain private.
ALTER TABLE "User"
  ADD COLUMN "displayName" VARCHAR(40),
  ADD COLUMN "bio" VARCHAR(160);
