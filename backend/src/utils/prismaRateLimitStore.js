// PostgreSQL keeps Coach message limits consistent when the API runs in more than one process.
export class PrismaRateLimitStore {
  constructor(prismaClient) {
    this.prisma = prismaClient;
    this.windowMs = 0;
  }

  // express-rate-limit supplies the configured window when the middleware is created.
  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    if (!this.windowMs) {
      throw new Error("The shared rate-limit store must be initialised before use.");
    }

    const now = new Date();
    const resetAt = new Date(now.getTime() + this.windowMs);

    // Clear stale buckets other than this key; its expiry is handled atomically below.
    // Keeping the active key in the upsert avoids a delete/insert race at the window boundary.
    await this.prisma.$executeRaw`
      DELETE FROM "CoachRateLimitBucket"
      WHERE "resetAt" <= ${now} AND "key" <> ${key}
    `;

    // The unique key and conditional upsert make concurrent requests share one counter.
    // An expired window resets to one hit and a fresh expiry in the same database statement.
    const rows = await this.prisma.$queryRaw`
      INSERT INTO "CoachRateLimitBucket" ("key", "hits", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key")
      DO UPDATE SET
        "hits" = CASE
          WHEN "CoachRateLimitBucket"."resetAt" <= ${now} THEN 1
          ELSE "CoachRateLimitBucket"."hits" + 1
        END,
        "resetAt" = CASE
          WHEN "CoachRateLimitBucket"."resetAt" <= ${now} THEN ${resetAt}
          ELSE "CoachRateLimitBucket"."resetAt"
        END
      RETURNING "hits", "resetAt"
    `;

    const bucket = rows[0];
    if (!bucket) {
      throw new Error("The shared rate-limit store did not return its updated bucket.");
    }

    return {
      totalHits: Number(bucket.hits),
      resetTime: bucket.resetAt
    };
  }

  // A skipped successful request should not consume the account's hourly allowance.
  async decrement(key) {
    await this.prisma.$executeRaw`
      UPDATE "CoachRateLimitBucket"
      SET "hits" = GREATEST("hits" - 1, 0)
      WHERE "key" = ${key}
    `;
  }

  // express-rate-limit calls resetKey when a bucket is explicitly cleared.
  async resetKey(key) {
    await this.prisma.$executeRaw`
      DELETE FROM "CoachRateLimitBucket"
      WHERE "key" = ${key}
    `;
  }

  async resetAll() {
    await this.prisma.$executeRaw`DELETE FROM "CoachRateLimitBucket"`;
  }
}
