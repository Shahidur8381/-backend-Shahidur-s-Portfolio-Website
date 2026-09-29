import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";
import db, { sqlite } from "./db/connection";
import { runSeed } from "./db/seed";
import { adminConfig } from "./db/schema";
import { generateTOTPSecret, hasTOTPSecret } from "./utils/totp";
import publicRoutes from "./routes/public";
import adminRoutes from "./routes/admin";

// ─── Timestamp logger ─────────────────────────────────────────────────────────
function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

const app = express();
app.set("trust proxy", 1);
const PORT = parseInt(process.env.PORT || "4000", 10);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      const isAllowed =
        allowedOrigins.includes(origin) ||
        allowedOrigins.includes("*") ||
        /^https?:\/\/([a-zA-Z0-9-]+\.)*shahidur\.dev(:\d+)?$/.test(origin) ||
        /^https?:\/\/([a-zA-Z0-9-]+\.)*vercel\.app(:\d+)?$/.test(origin) ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin);

      if (isAllowed) {
        callback(null, true);
      } else {
        log(`Blocked by CORS: ${origin}`);
        callback(new Error(`CORS policy: ${origin} not allowed`));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Setup-Key", "X-Filename", "Accept", "Origin", "X-Requested-With"],
    credentials: true,
  })
);

import { UPLOADS_DIR } from "./utils/upload";

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use(express.raw({ type: "application/pdf", limit: "15mb" }));

// ─── Static files (uploaded images) ───────────────────────────────────────────
app.use(["/uploads", "/api/uploads"], express.static(UPLOADS_DIR));

// ─── Request logging ──────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  log(`${req.method} ${req.originalUrl} — IP: ${req.ip}`);
  next();
});

// ─── Rate limiting (admin routes only) ───────────────────────────────────────
const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.ADMIN_RATE_LIMIT || "100", 10),
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Routes ───────────────────────────────────────────────────────────────────
// Support both /api/admin and /admin prefixes
app.use("/api/admin", adminLimiter, adminRoutes);
app.use("/admin", adminLimiter, adminRoutes);

// Support both /api and root / routes
app.use("/api", publicRoutes);
app.use("/", publicRoutes);

// Direct shortcuts for auth if called without prefix
app.post(["/login", "/api/login"], (req, res, next) => {
  adminRoutes(req, res, next);
});
app.get(["/verify", "/api/verify"], (req, res, next) => {
  adminRoutes(req, res, next);
});

// ─── TOTP Setup Endpoint ──────────────────────────────────────────────────────
app.post(["/api/setup/totp", "/setup/totp"], (req, res) => {
  const setupKey = req.headers["x-setup-key"];
  const envKey = process.env.SETUP_KEY;

  if (!envKey || setupKey !== envKey) {
    return res.status(403).json({ error: "Invalid or missing X-Setup-Key header." });
  }

  if (hasTOTPSecret()) {
    return res.status(403).json({
      error: "TOTP is already configured via TOTP_SHARED_SECRET environment variable.",
    });
  }

  const label = "PortfolioAdmin";
  const { secret, uri } = generateTOTPSecret(label);

  log("✅ TOTP secret generated for manual setup.");

  return res.status(201).json({
    message: "TOTP configured successfully. Scan the QR URI with Google Authenticator.",
    otpauthUri: uri,
    secret,
    instructions: [
      "1. Open Google Authenticator on your phone.",
      "2. Tap '+' → 'Scan a QR Code' or 'Enter a setup key'.",
      "3. Use the otpauthUri to generate a QR code, or enter the secret manually.",
      "4. Use the 6-digit code from the app in the Authorization header: 'TOTP <code>'",
    ],
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log(`ERROR: ${err.message}`);
  res.status(500).json({ error: err.message || "Internal server error" });
});

// ─── Startup Sequence ─────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    log("🔌 Connecting to SQLite database...");

    // Step 1: Run migrations (creates tables)
    const migrationsFolder = path.join(__dirname, "..", "drizzle");
    try {
      migrate(db, { migrationsFolder });
      log("✅ Migrations applied.");
    } catch (err) {
      // Migrations folder may not exist on first build — that's OK if tables exist
      log(`⚠️  Migrations skipped or already applied: ${(err as Error).message}`);
    }

    // Safe migration for category column
    try {
      (db as any).prepare("ALTER TABLE projects ADD COLUMN category TEXT DEFAULT 'Full-Stack'").run();
      console.log("Added category column to projects table");
    } catch (e) {
      // Column already exists, safe to ignore
    }

    try {
      (db as any).prepare("UPDATE projects SET category = 'Full-Stack' WHERE category IS NULL OR category = ''").run();
    } catch (e) {
      // Safe to ignore
    }

    // Safe migration for resumeUrl column in personal table
    try {
      const personalInfo = (db as any).prepare("PRAGMA table_info(personal)").all() as Array<{ name: string }>;
      const hasResumeUrl = personalInfo.some((col) => col.name === "resumeUrl");
      if (!hasResumeUrl) {
        (db as any).prepare("ALTER TABLE personal ADD COLUMN resumeUrl TEXT").run();
        log("✅ Added resumeUrl column to personal table");
      }
    } catch (e) {
      log(`⚠️  resumeUrl column check/migration: ${(e as Error).message}`);
    }

    // Safe migration for social_links table
    try {
      (db as any).prepare(`
        CREATE TABLE IF NOT EXISTS social_links (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          platform TEXT NOT NULL,
          label TEXT,
          url TEXT NOT NULL,
          icon TEXT,
          displayInContact INTEGER NOT NULL DEFAULT 0,
          displayInFooter INTEGER NOT NULL DEFAULT 1,
          sortOrder INTEGER NOT NULL DEFAULT 0,
          isActive INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT,
          updatedAt TEXT
        )
      `).run();
      log("✅ Verified / created social_links table");
    } catch (e) {
      log(`⚠️  social_links table migration: ${(e as Error).message}`);
    }

    // Step 2: Seed the database
    await runSeed();

    // Step 3: Start Express
    app.listen(PORT, "0.0.0.0", () => {
      log(`🚀 Portfolio API running on port ${PORT}`);
      log(`📌 Public:  GET http://localhost:${PORT}/api/portfolio`);
      log(`🔒 Admin:   /api/admin/* (requires TOTP)`);
      log(`🔑 Setup:   POST http://localhost:${PORT}/api/setup/totp`);
    });
  } catch (err) {
    log(`❌ Fatal startup error: ${(err as Error).message}`);
    process.exit(1);
  }
}

bootstrap();
