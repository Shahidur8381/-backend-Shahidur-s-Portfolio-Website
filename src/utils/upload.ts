import path from "path";
import fs from "fs";

export const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(
  process.env.DATABASE_URL ? path.dirname(process.env.DATABASE_URL) : path.join(__dirname, "..", "..", "data"),
  "uploads"
);

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
