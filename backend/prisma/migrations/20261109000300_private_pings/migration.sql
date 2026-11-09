-- Store private one-to-one conversations separately from public social posts.
-- The sorted participant pair prevents duplicate conversations created from opposite directions.
CREATE TABLE "DirectConversation" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DirectConversation_userAId_userBId_key" ON "DirectConversation"("userAId", "userBId");
CREATE INDEX "DirectConversation_userAId_status_lastMessageAt_idx" ON "DirectConversation"("userAId", "status", "lastMessageAt");
CREATE INDEX "DirectConversation_userBId_status_lastMessageAt_idx" ON "DirectConversation"("userBId", "status", "lastMessageAt");
CREATE INDEX "DirectConversation_requesterId_status_idx" ON "DirectConversation"("requesterId", "status");
CREATE INDEX "DirectMessage_conversationId_createdAt_id_idx" ON "DirectMessage"("conversationId", "createdAt", "id");
CREATE INDEX "DirectMessage_senderId_createdAt_idx" ON "DirectMessage"("senderId", "createdAt");

ALTER TABLE "DirectConversation" ADD CONSTRAINT "DirectConversation_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectConversation" ADD CONSTRAINT "DirectConversation_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectConversation" ADD CONSTRAINT "DirectConversation_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "DirectConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
