-- Minimal social profile fields. Email and credentials remain private.
-- Optional display fields stay separate from sign-in identity and password credentials.
ALTER TABLE "User"
  ADD COLUMN "displayName" VARCHAR(40),
  ADD COLUMN "bio" VARCHAR(160);
