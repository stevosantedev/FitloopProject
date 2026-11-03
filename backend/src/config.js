import "dotenv/config";
import { z } from "zod";

// Validate settings once at startup so missing secrets fail before the server accepts requests.
const settings = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  COACH_SERVICE_URL: z.string().url().default("http://127.0.0.1:8000")
});

export const config = settings.parse(process.env);
