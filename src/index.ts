import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";
import db, { sqlite } from "./db/connection";
import { runSeed } from "./db/seed";
import { adminConfig } from "./db/schema";
import { generateTOTPSecret, storeTOTPSecret } from "./utils/totp";
import publicRoutes from "./routes/public";
import adminRoutes from "./routes/admin";

// ─── Timestamp logger ─────────────────────────────────────────────────────────
function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

const app = express();
const PORT = parseInt(process.env.PORT || "4000", 10);

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy: ${origin} not allowed`));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Setup-Key"],
    credentials: true,
  })
);

import { UPLOADS_DIR } from "./utils/upload";

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// ─── Static files (uploaded images) ───────────────────────────────────────────
app.use("/uploads", express.static(UPLOADS_DIR));

// ─── Request logging ──────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  log(`${req.method} ${req.originalUrl} — IP: ${req.ip}`);
  next();
});

// ─── Rate limiting (admin routes only) ───────────────────────────────────────
const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api", publicRoutes);
app.use("/api/admin", adminLimiter, adminRoutes);

// ─── TOTP Setup Endpoint ──────────────────────────────────────────────────────
app.post("/api/setup/totp", (req, res) => {
  const setupKey = req.headers["x-setup-key"];
  const envKey = process.env.SETUP_KEY;

  if (!envKey || setupKey !== envKey) {
    return res.status(403).json({ error: "Invalid or missing X-Setup-Key header." });
  }

  // Check if already set up
  const existing = db.select().from(adminConfig).all();
  if (existing.length > 0) {
    return res.status(403).json({
      error: "TOTP already configured. Reset the admin_config table to re-setup.",
    });
  }

  const label = "PortfolioAdmin";
  const { secret, uri } = generateTOTPSecret(label);
  storeTOTPSecret(secret, label);

  log("✅ TOTP secret generated and stored.");

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
