import * as OTPAuth from "otpauth";
import db from "../db/connection";
import { adminConfig } from "../db/schema";

export function generateTOTPSecret(label = "PortfolioAdmin"): {
  secret: string;
  uri: string;
} {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: "PortfolioBackend",
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });

  return {
    secret: secret.base32,
    uri: totp.toString(),
  };
}

export function verifyTOTP(code: string, secretBase32: string): boolean {
  try {
    const secret = OTPAuth.Secret.fromBase32(secretBase32);
    const totp = new OTPAuth.TOTP({
      issuer: "PortfolioBackend",
      label: "PortfolioAdmin",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });

    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}

export function getStoredSecret(): string | null {
  return process.env.TOTP_SHARED_SECRET || null;
}

export function storeTOTPSecret(secret: string, label: string): void {
  console.warn("TOTP secret is now managed via TOTP_SHARED_SECRET environment variable. Database storage is disabled.");
}

export function hasTOTPSecret(): boolean {
  return getStoredSecret() !== null;
}
