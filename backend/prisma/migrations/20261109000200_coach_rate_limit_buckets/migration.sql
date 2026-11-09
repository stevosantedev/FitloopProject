-- Persist Coach rate-limit buckets so separate API instances share the same account ceiling.
CREATE TABLE "CoachRateLimitBucket" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CoachRateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- Expiry cleanup only needs to scan the oldest active buckets.
CREATE INDEX "CoachRateLimitBucket_resetAt_idx"
ON "CoachRateLimitBucket"("resetAt");
