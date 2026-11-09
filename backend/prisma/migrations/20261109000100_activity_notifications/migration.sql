-- Store private in-app activity notifications for social interactions.
-- Recipient deletion removes the inbox; actor deletion preserves the event but removes identity;
-- deleting a post removes notifications that point to that post.
CREATE TABLE "ActivityNotification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "actorId" TEXT,
    "postId" TEXT,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    CONSTRAINT "ActivityNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivityNotification_recipientId_readAt_createdAt_idx"
ON "ActivityNotification"("recipientId", "readAt", "createdAt");

CREATE INDEX "ActivityNotification_postId_idx"
ON "ActivityNotification"("postId");

ALTER TABLE "ActivityNotification"
ADD CONSTRAINT "ActivityNotification_recipientId_fkey"
FOREIGN KEY ("recipientId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActivityNotification"
ADD CONSTRAINT "ActivityNotification_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ActivityNotification"
ADD CONSTRAINT "ActivityNotification_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "FeedPost"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
