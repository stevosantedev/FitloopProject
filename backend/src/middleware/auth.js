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
    // Read credentials only from the Authorization header; request bodies and query strings are not trusted for identity.
    const header = req.get("authorization");
    // Require the Bearer scheme explicitly so malformed headers do not get interpreted as tokens.
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) return res.status(401).json({ error: "Sign in to continue." });

    try {
      // Pin the algorithm, issuer and audience to the FitLoop contract; accepting JWT defaults
      // would allow tokens intended for another service or signing method.
      const payload = jwt.verify(token, secret, {
        algorithms: ["HS256"],
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE
      });
      // A valid signature is not enough: the subject must identify an account before routes can query it.
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
