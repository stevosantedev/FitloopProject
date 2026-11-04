import jwt from "jsonwebtoken";
import { config } from "../config.js";

const TOKEN_ISSUER = "fitloop-api";
const TOKEN_AUDIENCE = "fitloop-web";

/**
 * Build the bearer-token guard with an explicit signing secret. Keeping the
 * factory injectable lets the token contract be tested without application secrets.
 */
export function createAuthMiddleware(secret) {
  return function requireAuth(req, res, next) {
    const header = req.get("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) return res.status(401).json({ error: "Sign in to continue." });

    try {
      const payload = jwt.verify(token, secret, {
        algorithms: ["HS256"],
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE
      });
      if (typeof payload.sub !== "string" || payload.sub.length === 0) {
        return res.status(401).json({ error: "Your session is invalid." });
      }

      // The account ID is accepted only from a verified token, never request data.
      req.userId = payload.sub;
      return next();
    } catch {
      // Keep malformed, expired and incorrectly signed tokens indistinguishable.
      return res.status(401).json({ error: "Your session has expired. Please sign in again." });
    }
  };
}

export const requireAuth = createAuthMiddleware(config.JWT_SECRET);
