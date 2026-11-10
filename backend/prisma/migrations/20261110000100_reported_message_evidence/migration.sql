-- Keep the exact content of a message only when a member reports it.
-- Ordinary private messages still follow the existing account-deletion cascade.
ALTER TABLE "ContentReport"
  ADD COLUMN "reportedMessageBody" VARCHAR(2000),
  ADD COLUMN "reportedMessageCreatedAt" TIMESTAMP(3),
  ADD COLUMN "reportedMessageSenderId" TEXT;
