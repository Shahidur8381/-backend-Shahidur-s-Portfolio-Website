import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";
import db from "../db/connection";
import {
  personal,
  navLinks,
  whatIBuilt,
  education,
  experiences,
  projects,
  testimonials,
  adminConfig,
  adminSessions,
} from "../db/schema";
import { totpAuth } from "../middleware/auth";
import { verifyTOTP } from "../utils/totp";

const router = Router();

// ─── Login Endpoint (Public - Generates 7-Day Bearer Session Token) ────────────
const LoginSchema = z.object({
  code: z.string().length(6, "Code must be 6 digits"),
});

router.post("/login", (req: Request, res: Response) => {
  try {
    const { code } = LoginSchema.parse(req.body);
    const config = db.select().from(adminConfig).all();
    if (config.length === 0 || !config[0].totpSecret) {
      return res.status(400).json({ error: "TOTP not configured on server." });
    }
    const valid = verifyTOTP(code, config[0].totpSecret);
    if (!valid) {
      return res.status(401).json({ error: "Invalid or expired Google Authenticator code." });
    }

    // Generate secure session token (valid for 60 minutes)
    const token = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    const SESSION_DURATION_MS = 60 * 60 * 1000; // 60 minutes
    const expiresAt = now + SESSION_DURATION_MS;

    db.insert(adminSessions)
      .values({
        token,
        expiresAt,
        createdAt: now,
      })
      .run();

    return res.json({
      success: true,
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      expiresInSeconds: Math.floor(SESSION_DURATION_MS / 1000),
      message: "Login successful. Include 'Authorization: Bearer <token>' in all requests.",
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Login failed." });
  }
});

// Apply Auth (Bearer session token or direct TOTP) to ALL remaining admin routes
router.use(totpAuth);

// ─── Destroy Session / Logout & Verify ────────────────────────────────────────
router.post(["/logout", "/destroy-session"], (req: Request, res: Response) => {
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    db.delete(adminSessions).where(eq(adminSessions.token, token)).run();
  }
  return res.json({ success: true, message: "Session destroyed. Access revoked." });
});

router.post("/destroy-all-sessions", (_req: Request, res: Response) => {
  db.delete(adminSessions).run();
  return res.json({ success: true, message: "All active sessions destroyed." });
});

router.get("/verify", (req: Request, res: Response) => {
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const rows = db.select().from(adminSessions).where(eq(adminSessions.token, token)).all();
    if (rows.length > 0) {
      const remainingMs = Math.max(0, rows[0].expiresAt - Date.now());
      return res.json({
        success: true,
        authenticated: true,
        expiresAt: new Date(rows[0].expiresAt).toISOString(),
        remainingSeconds: Math.floor(remainingMs / 1000),
      });
    }
  }
  return res.json({ success: true, authenticated: true });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const TABLE_MAP: Record<string, typeof personal | typeof navLinks | typeof whatIBuilt | typeof education | typeof experiences | typeof projects | typeof testimonials> = {
  personal,
  nav_links: navLinks,
  what_i_built: whatIBuilt,
  education,
  experiences,
  projects,
  testimonials,
};

import fs from "fs";
import path from "path";
import { UPLOADS_DIR } from "../utils/upload";

// ─── Personal ─────────────────────────────────────────────────────────────────
const PersonalSchema = z.object({
  name: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  salam: z.string().optional().nullable(),
  salamMeaning: z.string().optional().nullable(),
  roles: z.array(z.string()).optional(),
  aboutIntro: z.string().optional().nullable(),
  portrait: z.string().optional().nullable(),
});

router.put("/personal", (req: Request, res: Response) => {
  try {
    const parsed = PersonalSchema.parse(req.body);
    const updateData: Record<string, unknown> = { ...parsed };
    if (parsed.roles) updateData.roles = JSON.stringify(parsed.roles);
    // Only run update if there's something to update
    if (Object.keys(updateData).length > 0) {
      db.update(personal).set(updateData).where(eq(personal.id, 1)).run();
    }
    const updated = db.select().from(personal).where(eq(personal.id, 1)).all();
    return res.json({ ...updated[0], roles: parseJSON<string[]>(updated[0]?.roles, []) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Failed to update personal info" });
  }
});

// ─── Image Upload ─────────────────────────────────────────────────────────────
const UploadSchema = z.object({
  image: z.string(), // Base64 data URL or pure base64 string
  filename: z.string().optional(),
});

router.post("/upload", (req: Request, res: Response) => {
  try {
    const { image, filename } = UploadSchema.parse(req.body);
    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer: Buffer;
    let ext = "png";

    if (matches && matches.length === 3) {
      const mime = matches[1].toLowerCase();
      if (mime.includes("jpeg") || mime.includes("jpg")) ext = "jpg";
      else if (mime.includes("webp")) ext = "webp";
      else if (mime.includes("gif")) ext = "gif";
      else if (mime.includes("svg")) ext = "svg";
      buffer = Buffer.from(matches[2], "base64");
    } else {
      buffer = Buffer.from(image, "base64");
    }

    const safeName = filename
      ? filename.replace(/[^a-zA-Z0-9.-]/g, "_")
      : `image-${Date.now()}.${ext}`;
    const cleanFilename = `${Date.now()}-${safeName}`;
    const filePath = path.join(UPLOADS_DIR, cleanFilename);
    fs.writeFileSync(filePath, buffer);

    const host = req.get("host") || "api.shahidur.dev";
    const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const url = `${protocol}://${host}/uploads/${cleanFilename}`;

    return res.status(201).json({
      url,
      relativeUrl: `/uploads/${cleanFilename}`,
      filename: cleanFilename,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Failed to upload image" });
  }
});

// ─── Nav Links ────────────────────────────────────────────────────────────────
const NavLinkSchema = z.object({
  navId: z.string(),
  title: z.string(),
  sortOrder: z.number().optional(),
});

router.post("/nav-links", (req: Request, res: Response) => {
  try {
    const parsed = NavLinkSchema.parse(req.body);
    const result = db.insert(navLinks).values(parsed).run();
    return res.status(201).json({ id: result.lastInsertRowid, ...parsed });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Failed to create nav link" });
  }
});

router.put("/nav-links/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const parsed = NavLinkSchema.partial().parse(req.body);
    db.update(navLinks).set(parsed).where(eq(navLinks.id, id)).run();
    return res.json({ message: "Updated successfully" });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Failed to update nav link" });
  }
});

router.delete("/nav-links/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    db.delete(navLinks).where(eq(navLinks.id, id)).run();
    return res.json({ message: "Deleted successfully" });
  } catch {
    return res.status(500).json({ error: "Failed to delete nav link" });
  }
});

// ─── What I Built ─────────────────────────────────────────────────────────────
const WhatIBuiltSchema = z.object({
  number: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  tech: z.string().optional(),
  iconType: z.string().optional(),
  isPrimary: z.boolean().optional(),
  showOnHomepage: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

router.post("/what-i-built", (req: Request, res: Response) => {
  try {
    const parsed = WhatIBuiltSchema.parse(req.body);
    const result = db.insert(whatIBuilt).values(parsed).run();
    return res.status(201).json({ id: result.lastInsertRowid, ...parsed });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Failed to create capability" });
  }
});

router.put("/what-i-built/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const parsed = WhatIBuiltSchema.partial().parse(req.body);
    db.update(whatIBuilt).set(parsed).where(eq(whatIBuilt.id, id)).run();
    return res.json({ message: "Updated successfully" });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Failed to update capability" });
  }
});

router.delete("/what-i-built/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    db.delete(whatIBuilt).where(eq(whatIBuilt.id, id)).run();
    return res.json({ message: "Deleted successfully" });
  } catch {
    return res.status(500).json({ error: "Failed to delete capability" });
  }
});

// ─── Education ────────────────────────────────────────────────────────────────
const EducationSchema = z.object({
  title: z.string(),
  institution: z.string(),
  result: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  image: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  expectedGraduationYear: z.number().nullable().optional(),
  showOnHomepage: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

router.post("/education", (req: Request, res: Response) => {
  try {
    const parsed = EducationSchema.parse(req.body);
    const result = db.insert(education).values({
      ...parsed,
      expectedGraduationYear: parsed.expectedGraduationYear ?? undefined,
    }).run();
    return res.status(201).json({ id: result.lastInsertRowid, ...parsed });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Failed to create education entry" });
  }
});

router.put("/education/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const parsed = EducationSchema.partial().parse(req.body);
    db.update(education).set(parsed).where(eq(education.id, id)).run();
    return res.json({ message: "Updated successfully" });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Failed to update education" });
  }
});

router.delete("/education/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    db.delete(education).where(eq(education.id, id)).run();
    return res.json({ message: "Deleted successfully" });
  } catch {
    return res.status(500).json({ error: "Failed to delete education" });
  }
});

// ─── Experiences ──────────────────────────────────────────────────────────────
const ExperienceSchema = z.object({
  slug: z.string(),
  title: z.string(),
  companyName: z.string(),
  date: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  image: z.string().optional().nullable(),
  iconBg: z.string().optional().nullable(),
  points: z.array(z.string()).optional(),
  showOnHomepage: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

router.post("/experiences", (req: Request, res: Response) => {
  try {
    const parsed = ExperienceSchema.parse(req.body);
    const result = db
      .insert(experiences)
      .values({ ...parsed, points: parsed.points ? JSON.stringify(parsed.points) : undefined })
      .run();
    return res.status(201).json({ id: result.lastInsertRowid, ...parsed });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Failed to create experience" });
  }
});

router.put("/experiences/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const parsed = ExperienceSchema.partial().parse(req.body);
    const updateData: Record<string, unknown> = { ...parsed };
    if (parsed.points) updateData.points = JSON.stringify(parsed.points);
    db.update(experiences).set(updateData).where(eq(experiences.id, id)).run();
    return res.json({ message: "Updated successfully" });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Failed to update experience" });
  }
});

router.delete("/experiences/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    db.delete(experiences).where(eq(experiences.id, id)).run();
    return res.json({ message: "Deleted successfully" });
  } catch {
    return res.status(500).json({ error: "Failed to delete experience" });
  }
});

// ─── Projects ─────────────────────────────────────────────────────────────────
const ProjectSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().optional(),
  tags: z.array(z.object({ name: z.string(), color: z.string() })).optional(),
  image: z.string().optional(),
  sourceCodeLink: z.string().optional(),
  liveDemoLink: z.string().nullable().optional(),
  showOnHomepage: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

router.post("/projects", (req: Request, res: Response) => {
  try {
    const parsed = ProjectSchema.parse(req.body);
    const result = db
      .insert(projects)
      .values({
        ...parsed,
        tags: parsed.tags ? JSON.stringify(parsed.tags) : undefined,
        liveDemoLink: parsed.liveDemoLink ?? undefined,
      })
      .run();
    return res.status(201).json({ id: result.lastInsertRowid, ...parsed });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Failed to create project" });
  }
});

router.put("/projects/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const parsed = ProjectSchema.partial().parse(req.body);
    const updateData: Record<string, unknown> = { ...parsed };
    if (parsed.tags) updateData.tags = JSON.stringify(parsed.tags);
    db.update(projects).set(updateData).where(eq(projects.id, id)).run();
    return res.json({ message: "Updated successfully" });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Failed to update project" });
  }
});

router.delete("/projects/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    db.delete(projects).where(eq(projects.id, id)).run();
    return res.json({ message: "Deleted successfully" });
  } catch {
    return res.status(500).json({ error: "Failed to delete project" });
  }
});

// ─── Testimonials ─────────────────────────────────────────────────────────────
const TestimonialSchema = z.object({
  testimonial: z.string(),
  name: z.string(),
  designation: z.string().optional(),
  company: z.string().optional(),
  image: z.string().optional(),
  showOnHomepage: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

router.post("/testimonials", (req: Request, res: Response) => {
  try {
    const parsed = TestimonialSchema.parse(req.body);
    const result = db.insert(testimonials).values(parsed).run();
    return res.status(201).json({ id: result.lastInsertRowid, ...parsed });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Failed to create testimonial" });
  }
});

router.put("/testimonials/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const parsed = TestimonialSchema.partial().parse(req.body);
    db.update(testimonials).set(parsed).where(eq(testimonials.id, id)).run();
    return res.json({ message: "Updated successfully" });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Failed to update testimonial" });
  }
});

router.delete("/testimonials/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    db.delete(testimonials).where(eq(testimonials.id, id)).run();
    return res.json({ message: "Deleted successfully" });
  } catch {
    return res.status(500).json({ error: "Failed to delete testimonial" });
  }
});

// ─── Reorder (batch sortOrder) ────────────────────────────────────────────────
const ReorderSchema = z.object({ ids: z.array(z.number()) });

const REORDER_TABLE_MAP: Record<string, { table: typeof navLinks | typeof whatIBuilt | typeof education | typeof experiences | typeof projects | typeof testimonials; idCol: typeof navLinks.id | typeof whatIBuilt.id | typeof education.id | typeof experiences.id | typeof projects.id | typeof testimonials.id; sortCol: typeof navLinks.sortOrder | typeof whatIBuilt.sortOrder | typeof education.sortOrder | typeof experiences.sortOrder | typeof projects.sortOrder | typeof testimonials.sortOrder }> = {
  nav_links: { table: navLinks, idCol: navLinks.id, sortCol: navLinks.sortOrder },
  what_i_built: { table: whatIBuilt, idCol: whatIBuilt.id, sortCol: whatIBuilt.sortOrder },
  education: { table: education, idCol: education.id, sortCol: education.sortOrder },
  experiences: { table: experiences, idCol: experiences.id, sortCol: experiences.sortOrder },
  projects: { table: projects, idCol: projects.id, sortCol: projects.sortOrder },
  testimonials: { table: testimonials, idCol: testimonials.id, sortCol: testimonials.sortOrder },
};

router.put("/reorder/:table", (req: Request, res: Response) => {
  try {
    const tableName = req.params.table;
    const tableInfo = REORDER_TABLE_MAP[tableName];
    if (!tableInfo) {
      return res.status(400).json({
        error: `Unknown table. Valid options: ${Object.keys(REORDER_TABLE_MAP).join(", ")}`,
      });
    }
    const { ids } = ReorderSchema.parse(req.body);
    // Update sortOrder based on position in ids array
    for (let i = 0; i < ids.length; i++) {
      db.update(tableInfo.table)
        .set({ sortOrder: i })
        // @ts-ignore
        .where(eq(tableInfo.idCol, ids[i]))
        .run();
    }
    return res.json({ message: `Reordered ${ids.length} items in ${tableName}` });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Failed to reorder" });
  }
});

export default router;
