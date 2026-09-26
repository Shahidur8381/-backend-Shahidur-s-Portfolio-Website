import { Request, Response, NextFunction } from "express";
import { verifyTOTP } from "../utils/totp";
import db from "../db/connection";
import { adminConfig } from "../db/schema";

export function totpAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("TOTP ")) {
    res.status(401).json({
      error: "Missing or invalid Authorization header. Expected: TOTP <6-digit-code>",
    });
    return;
  }

  const code = authHeader.slice(5).trim();

  if (!/^\d{6}$/.test(code)) {
    res.status(401).json({ error: "Invalid TOTP code format. Expected 6 digits." });
    return;
  }

  // Fetch stored secret
  const config = db.select().from(adminConfig).all();
  if (config.length === 0 || !config[0].totpSecret) {
    res.status(401).json({
      error: "TOTP not configured. Please call POST /api/setup/totp first.",
    });
    return;
  }

  const valid = verifyTOTP(code, config[0].totpSecret);
  if (!valid) {
    res.status(401).json({ error: "Invalid or expired TOTP code." });
    return;
  }

  next();
}
