import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const dbUrl = process.env.DATABASE_URL || "./data/portfolio.db";

// Ensure the data directory exists
const dbDir = path.dirname(dbUrl);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(dbUrl);

// Enable WAL mode for better concurrent read performance
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
(db as any).prepare = sqlite.prepare.bind(sqlite);

export { sqlite };

export default db;
