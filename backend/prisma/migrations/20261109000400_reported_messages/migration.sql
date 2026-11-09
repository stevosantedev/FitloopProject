-- Link moderation reports to private messages without copying message content into the report.
-- Deleting a message keeps the report record but clears its optional message reference.
ALTER TABLE "ContentReport" ADD COLUMN "messageId" TEXT;
CREATE INDEX "ContentReport_messageId_createdAt_idx" ON "ContentReport"("messageId", "createdAt");
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "DirectMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
