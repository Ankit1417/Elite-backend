import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/appError.js";

interface RateLimitStore {
  count: number;
  resetTime: number;
}

const loginAttempts = new Map<string, RateLimitStore>();

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function getClientIdentifier(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded && typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return ip;
}

export function rateLimitLogin(req: Request, res: Response, next: NextFunction) {
  const clientId = getClientIdentifier(req);
  const now = Date.now();

  const existing = loginAttempts.get(clientId);

  if (!existing || now > existing.resetTime) {
    // Reset or create new entry
    loginAttempts.set(clientId, {
      count: 1,
      resetTime: now + WINDOW_MS,
    });
    return next();
  }

  if (existing.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((existing.resetTime - now) / 1000);
    res.setHeader("Retry-After", retryAfter.toString());
    throw new AppError(
      `Too many login attempts. Please try again in ${Math.ceil(retryAfter / 60)} minutes.`,
      429
    );
  }

  existing.count++;
  loginAttempts.set(clientId, existing);
  next();
}

// Clean up expired entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of loginAttempts.entries()) {
    if (now > value.resetTime) {
      loginAttempts.delete(key);
    }
  }
}, 5 * 60 * 1000);
