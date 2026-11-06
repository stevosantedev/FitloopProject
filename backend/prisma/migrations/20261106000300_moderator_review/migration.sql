-- Record the latest moderator decision without granting roles through user-editable profile fields.
ALTER TABLE "ContentReport"
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "resolutionNote" VARCHAR(1000);
ALTER TABLE "ContentReport"
  ADD CONSTRAINT "ContentReport_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ContentReport_reviewedById_reviewedAt_idx"
  ON "ContentReport"("reviewedById", "reviewedAt");
