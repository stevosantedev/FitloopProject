import jwt from "jsonwebtoken";
import { config } from "../config.js";

// Routes use this middleware so ownership always comes from the verified session, not request data.
export function requireAuth(req, res, next) {
  const header = req.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: "Sign in to continue." });

  try {
    const payload = jwt.verify(token, config.JWT_SECRET);
    if (typeof payload.sub !== "string") {
      return res.status(401).json({ error: "Your session is invalid." });
    }

    req.userId = payload.sub;
    return next();
  } catch {
    // Do not reveal whether a token was malformed, expired or signed with the wrong secret.
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}
