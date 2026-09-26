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
  const config = db.select().from(adminConfig).all();
  if (config.length === 0) return null;
  return config[0].totpSecret;
}

export function storeTOTPSecret(secret: string, label: string): void {
  db.insert(adminConfig)
    .values({ id: 1, totpSecret: secret, label })
    .run();
}

export function hasTOTPSecret(): boolean {
  return getStoredSecret() !== null;
}
