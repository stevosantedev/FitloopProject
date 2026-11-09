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

    // Expired buckets no longer affect a request, so remove them before writing the new count.
    // The indexed expiry column keeps this cleanup bounded to stale rows rather than a full scan.
    await this.prisma.$executeRaw`
      DELETE FROM "CoachRateLimitBucket"
      WHERE "resetAt" <= ${now}
    `;

    // The unique key makes concurrent requests increment one shared counter instead of
    // creating competing per-process counts. The first request establishes the reset time.
    const rows = await this.prisma.$queryRaw`
      INSERT INTO "CoachRateLimitBucket" ("key", "hits", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key")
      DO UPDATE SET "hits" = "CoachRateLimitBucket"."hits" + 1
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
