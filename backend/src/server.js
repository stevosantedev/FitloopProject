import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { ZodError } from "zod";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { requireAuth } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import dailyLogRoutes from "./routes/dailyLogs.js";
import workoutRoutes from "./routes/workouts.js";
import socialRoutes from "./routes/social.js";
import coachRoutes from "./routes/coach.js";
import analyticsRoutes from "./routes/analytics.js";

const app = express();

// Security headers, a strict browser origin and a small JSON limit reduce avoidable API exposure.
app.use(helmet());
app.use(cors({ origin: config.FRONTEND_ORIGIN }));
app.use(express.json({ limit: "32kb" }));

// Login and registration are rate-limited because password endpoints attract automated guessing.
app.use("/api/auth", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
}));
app.get("/health", (_req, res) => res.json({ status: "ok", service: "fitloop-api" }));

// This endpoint restores the signed-in profile after a page refresh without storing profile data in the token.
app.get("/api/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, username: true, displayName: true, bio: true, privateAccount: true, priority: true }
    });
    if (!user) return res.status(404).json({ error: "Account not found." });
    return res.json({ user });
  } catch (error) {
    return next(error);
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/daily-logs", requireAuth, dailyLogRoutes);
app.use("/api/workouts", requireAuth, workoutRoutes);
app.use("/api/social", requireAuth, socialRoutes);
app.use("/api/coach", requireAuth, coachRoutes);
app.use("/api/analytics", requireAuth, analyticsRoutes);

// Validation messages are useful to users; unexpected errors stay generic to avoid leaking internals.
app.use((error, _req, res, _next) => {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: "Please check the submitted information.", details: error.flatten() });
  }
  console.error(error);
  return res.status(500).json({ error: "Something went wrong. Please try again." });
});

const server = app.listen(config.PORT, () => {
  console.log(`FitLoop API listening on port ${config.PORT}`);
});

// Closing the database connection cleanly prevents hanging processes during local shutdowns.
async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
