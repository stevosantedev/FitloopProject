import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const registration = z.object({
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email().max(254),
  password: z.string().min(10).max(128)
});

const login = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128)
});

function createToken(userId) {
  // The token carries an ID only; profile details remain in the database.
  return jwt.sign({}, config.JWT_SECRET, { subject: userId, expiresIn: "2h", issuer: "fitloop-api", audience: "fitloop-web", algorithm: "HS256" });
}

router.post("/register", async (req, res, next) => {
  try {
    const input = registration.parse(req.body);
    const email = input.email.toLowerCase();

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username: input.username }] }
    });
    if (existing) return res.status(409).json({ error: "That email or username is already in use." });

    // Passwords are stored as slow hashes so a database leak does not reveal original passwords.
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: { username: input.username, email, passwordHash },
      select: { id: true, username: true }
    });

    return res.status(201).json({ token: createToken(user.id), user });
  } catch (error) {
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const input = login.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });

    // The same error covers unknown emails and wrong passwords to make account discovery harder.
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }

    return res.json({
      token: createToken(user.id),
      user: { id: user.id, username: user.username }
    });
  } catch (error) {
    return next(error);
  }
});


router.delete("/account", requireAuth, async (req, res, next) => {
  try {
    const input = z.object({ password: z.string().min(1).max(128), confirmation: z.literal("DELETE") }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.userId } });

    // Ask for the current password so a copied browser session alone cannot erase an account.
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      return res.status(401).json({ error: "The password is incorrect." });
    }

    // Remove dependent training records before private custom exercises. WorkoutSet
    // deliberately restricts exercise deletion so historical sessions cannot lose
    // their movement reference; deleting sessions first makes account removal safe.
    await prisma.$transaction(async (transaction) => {
      await transaction.workoutSession.deleteMany({ where: { userId: req.userId } });
      await transaction.workoutRoutine.deleteMany({ where: { userId: req.userId } });
      await transaction.exercise.deleteMany({ where: { ownerId: req.userId, isCustom: true } });
      // Remaining logs, social records, coach events and preferences cascade from the user.
      await transaction.user.delete({ where: { id: req.userId } });
    });
    return res.json({ deleted: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
