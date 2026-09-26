import { Request, Response, NextFunction } from "express";
import { and, eq, gt } from "drizzle-orm";
import { verifyTOTP } from "../utils/totp";
import db from "../db/connection";
import { adminConfig, adminSessions } from "../db/schema";

export function totpAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    res.status(401).json({
      error: "Missing Authorization header. Expected: Bearer <token> or TOTP <code>",
    });
    return;
  }

  // 1. Check Bearer Token (Session Token from login)
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (!token) {
      res.status(401).json({ error: "Empty Bearer token." });
      return;
    }

    const now = Date.now();
    const session = db
      .select()
      .from(adminSessions)
      .where(and(eq(adminSessions.token, token), gt(adminSessions.expiresAt, now)))
      .all();

    if (session.length === 0) {
      res.status(401).json({ error: "Invalid or expired session. Please log in again." });
      return;
    }

    return next();
  }

  // 2. Check direct TOTP code (Backward compatibility for curl / scripts)
  if (authHeader.startsWith("TOTP ")) {
    const code = authHeader.slice(5).trim();

    if (!/^\d{6}$/.test(code)) {
      res.status(401).json({ error: "Invalid TOTP code format. Expected 6 digits." });
      return;
    }

    const secret = process.env.TOTP_SHARED_SECRET;
    if (!secret) {
      res.status(401).json({
        error: "TOTP not configured in environment.",
      });
      return;
    }

    const valid = verifyTOTP(code, secret);
    if (!valid) {
      res.status(401).json({ error: "Invalid or expired TOTP code." });
      return;
    }

    return next();
  }

  res.status(401).json({
    error: "Invalid Authorization scheme. Use: Bearer <session_token> or TOTP <6-digit-code>",
  });
}
