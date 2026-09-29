import { Router, Request, Response } from "express";
import { eq, asc } from "drizzle-orm";
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
  socialLinks,
} from "../db/schema";
import { totpAuth } from "../middleware/auth";
import { verifyTOTP } from "../utils/totp";

const router = Router();

// ─── Login Endpoint (Public - Generates 7-Day Bearer Session Token) ────────────
const cleanCode = (val: unknown) => {
  if (val === undefined || val === null) return undefined;
  const s = String(val).trim();
  return s.length > 0 ? s : undefined;
};

const LoginSchema = z
  .object({
    code: z.preprocess(cleanCode, z.string().length(6, "Code must be 6 digits")).optional(),
    totp: z.preprocess(cleanCode, z.string().length(6, "Code must be 6 digits")).optional(),
    token: z.preprocess(cleanCode, z.string().length(6, "Code must be 6 digits")).optional(),
  })
  .refine((data: { code?: string; totp?: string; token?: string }) => Boolean(data.code || data.totp || data.token), {
    message: "Code must be 6 digits",
  });

router.post("/login", (req: Request, res: Response) => {
  try {
    const parsed = LoginSchema.parse(req.body);
    const code = (parsed.code || parsed.totp || parsed.token)!;
    const secret = process.env.TOTP_SHARED_SECRET;
    if (!secret) {
      return res.status(400).json({ error: "TOTP not configured on server." });
    }
    const valid = verifyTOTP(code, secret);
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
      accessToken: token,
      data: { token, accessToken: token },
      expiresAt: new Date(expiresAt).toISOString(),
      expiresInSeconds: Math.floor(SESSION_DURATION_MS / 1000),
      message: "Login successful. Include 'Authorization: Bearer <token>' in all requests.",
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0]?.message || "Code must be 6 digits" });
    }
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
import { Buffer } from "buffer";
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
  resumeUrl: z.string().optional().nullable(),
});

router.put("/personal", (req: Request, res: Response) => {
  try {
    const parsed = PersonalSchema.parse(req.body);
    const updateData: Record<string, unknown> = { ...parsed };
    if (parsed.roles) updateData.roles = JSON.stringify(parsed.roles);
    if ("resumeUrl" in parsed) {
      updateData.resumeUrl =
        parsed.resumeUrl && parsed.resumeUrl.trim() !== "" ? parsed.resumeUrl.trim() : null;
    }
    // Only run update if there's something to update
    if (Object.keys(updateData).length > 0) {
      db.update(personal).set(updateData).where(eq(personal.id, 1)).run();
    }
    const updated = db.select().from(personal).where(eq(personal.id, 1)).all();
    const row = updated[0];
    return res.json({
      ...row,
      resumeUrl: row ? (row.resumeUrl ?? null) : null,
      roles: parseJSON<string[]>(row?.roles, []),
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Failed to update personal info" });
  }
});

// ─── File & Image Upload ──────────────────────────────────────────────────────
const DANGEROUS_EXTENSIONS = new Set([
  "exe", "dll", "bat", "sh", "cmd", "ps1", "vbs", "js", "mjs", "cjs", "jsx", "ts", "tsx",
  "html", "htm", "xhtml", "svg", "xml", "php", "phtml", "py", "rb", "pl", "cgi",
  "jar", "war", "ear", "zip", "tar", "gz", "tgz", "bz2", "7z", "rar",
  "mp4", "mp3", "avi", "mov", "mkv", "webm", "wav"
]);

const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function isPdfBuffer(buf: Buffer): boolean {
  if (buf.length < 5) return false;
  // A standard PDF starts with %PDF- (hex: 25 50 44 46 2d) within the first 1024 bytes
  const header = buf.subarray(0, Math.min(buf.length, 1024)).toString("ascii");
  return header.includes("%PDF-");
}

function isImageBuffer(buf: Buffer): { isImage: boolean; ext: string } {
  if (buf.length < 4) return { isImage: false, ext: "" };
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { isImage: true, ext: "jpg" };
  }
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { isImage: true, ext: "png" };
  }
  // GIF: GIF87a or GIF89a
  if (buf.subarray(0, 3).toString("ascii") === "GIF") {
    return { isImage: true, ext: "gif" };
  }
  // WebP: RIFF ... WEBP
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { isImage: true, ext: "webp" };
  }
  return { isImage: false, ext: "" };
}

const UploadSchema = z.object({
  image: z.string().optional(),
  file: z.string().optional(),
  pdf: z.string().optional(),
  resume: z.string().optional(),
  filename: z.string().optional(),
  type: z.string().optional(),
  fileType: z.string().optional(),
});

interface ExtractedUpload {
  buffer: Buffer;
  filename?: string;
  mimeType?: string;
  isResumePath: boolean;
}

function extractUpload(req: Request): ExtractedUpload | { error: string } {
  const isResumeRoute = req.path.endsWith("/resume") || req.path.endsWith("/pdf");

  // Case 1: Raw buffer from express.raw (Content-Type: application/pdf)
  if (Buffer.isBuffer(req.body)) {
    const contentType = (req.headers["content-type"] || "").toLowerCase();
    if (contentType.includes("application/pdf")) {
      const headerFilename = req.headers["x-filename"];
      const filename = typeof headerFilename === "string" ? headerFilename : undefined;
      return {
        buffer: req.body,
        filename,
        mimeType: "application/pdf",
        isResumePath: true,
      };
    }
    return { error: "Unsupported Content-Type for binary upload." };
  }

  // Case 2: JSON body
  if (typeof req.body === "object" && req.body !== null) {
    const parsed = UploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return { error: "Invalid upload request body format." };
    }

    const body = parsed.data;
    const rawData = body.file || body.image || body.pdf || body.resume;
    if (!rawData || typeof rawData !== "string" || rawData.trim() === "") {
      return { error: "No file or image data provided in request body." };
    }

    const typeField = (body.type || body.fileType || req.query.type || "").toString().toLowerCase();
    const isResume = isResumeRoute || typeField === "resume" || Boolean(body.resume);

    const matches = rawData.match(/^data:([A-Za-z0-9\/\-+.]+);base64,(.+)$/);
    let buffer: Buffer;
    let mimeType: string | undefined;

    if (matches && matches.length === 3) {
      mimeType = matches[1].toLowerCase();
      try {
        buffer = Buffer.from(matches[2], "base64");
      } catch {
        return { error: "Invalid base64 payload." };
      }
    } else {
      try {
        buffer = Buffer.from(rawData, "base64");
      } catch {
        return { error: "Invalid base64 payload." };
      }
    }

    if (buffer.length === 0) {
      return { error: "Decoded file content is empty." };
    }

    return {
      buffer,
      filename: body.filename,
      mimeType,
      isResumePath: isResume,
    };
  }

  return { error: "Invalid request: empty or unsupported content." };
}

function handleUpload(req: Request, res: Response) {
  try {
    const extracted = extractUpload(req);
    if ("error" in extracted) {
      return res.status(400).json({ error: extracted.error });
    }

    const { buffer, filename, mimeType, isResumePath } = extracted;

    // Check extension if filename provided
    let fileExt = "";
    if (filename) {
      const parts = filename.split(".");
      if (parts.length > 1) {
        fileExt = parts.pop()!.toLowerCase();
      }
    }

    // 1. Immediately reject dangerous extensions (scripts, executables, html, svg, etc.)
    if (fileExt && DANGEROUS_EXTENSIONS.has(fileExt)) {
      return res.status(400).json({ error: `File type .${fileExt} is forbidden.` });
    }

    // 2. Reject dangerous MIME types
    if (mimeType) {
      if (
        mimeType.includes("svg") ||
        mimeType.includes("javascript") ||
        mimeType.includes("html") ||
        (mimeType.includes("octet-stream") && (fileExt === "exe" || fileExt === "sh"))
      ) {
        return res.status(400).json({ error: `MIME type ${mimeType} is forbidden.` });
      }
    }

    const hasPdfSignature = isPdfBuffer(buffer);

    // 3. RESUME UPLOAD PATH
    if (isResumePath) {
      // Reject non-PDF MIME type
      if (mimeType && mimeType !== "application/pdf") {
        return res.status(400).json({ error: "Only PDF files are allowed for resume upload." });
      }
      // Reject non-PDF extension
      if (fileExt && fileExt !== "pdf") {
        return res.status(400).json({ error: "Only .pdf files are allowed for resume upload." });
      }
      // Validate PDF signature
      if (!hasPdfSignature) {
        return res.status(400).json({ error: "Invalid PDF file: corrupted or invalid file signature." });
      }

      // Generate collision-safe filename
      const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
      const cleanFilename = `resume-${uniqueId}.pdf`;
      const filePath = path.join(UPLOADS_DIR, cleanFilename);
      fs.writeFileSync(filePath, buffer);

      const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "") || "";
      const relativeUrl = `/uploads/${cleanFilename}`;
      const returnUrl = baseUrl ? `${baseUrl}${relativeUrl}` : relativeUrl;

      return res.status(200).json({
        url: returnUrl,
        success: true,
        message: "Resume uploaded successfully",
      });
    }

    // 4. GENERAL UPLOAD PATH
    // Check if uploaded file is a PDF
    if (hasPdfSignature || mimeType === "application/pdf" || fileExt === "pdf") {
      if (!hasPdfSignature) {
        return res.status(400).json({ error: "Invalid PDF file: corrupted or invalid file signature." });
      }
      const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
      const cleanFilename = `resume-${uniqueId}.pdf`;
      const filePath = path.join(UPLOADS_DIR, cleanFilename);
      fs.writeFileSync(filePath, buffer);

      const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "") || "";
      const relativeUrl = `/uploads/${cleanFilename}`;
      const returnUrl = baseUrl ? `${baseUrl}${relativeUrl}` : relativeUrl;

      return res.status(200).json({
        url: returnUrl,
        success: true,
        message: "Resume uploaded successfully",
      });
    }

    // Check if uploaded file is an allowed image
    const imageInfo = isImageBuffer(buffer);
    let resolvedImageExt = imageInfo.ext;

    if (!imageInfo.isImage) {
      if (mimeType && (mimeType.includes("jpeg") || mimeType.includes("jpg"))) resolvedImageExt = "jpg";
      else if (mimeType && mimeType.includes("png")) resolvedImageExt = "png";
      else if (mimeType && mimeType.includes("webp")) resolvedImageExt = "webp";
      else if (mimeType && mimeType.includes("gif")) resolvedImageExt = "gif";
      else if (fileExt && ALLOWED_IMAGE_EXTENSIONS.has(fileExt)) resolvedImageExt = fileExt;
    }

    if (resolvedImageExt && ALLOWED_IMAGE_EXTENSIONS.has(resolvedImageExt)) {
      const safeName = filename
        ? filename.replace(/[^a-zA-Z0-9.-]/g, "_")
        : `image-${Date.now()}.${resolvedImageExt}`;
      const cleanFilename = `${Date.now()}-${safeName}`;
      const filePath = path.join(UPLOADS_DIR, cleanFilename);
      fs.writeFileSync(filePath, buffer);

      const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "") || "";
      const relativeUrl = `/uploads/${cleanFilename}`;
      const returnUrl = baseUrl ? `${baseUrl}${relativeUrl}` : relativeUrl;

      return res.status(200).json({
        url: returnUrl,
        success: true,
        message: "Image uploaded successfully",
      });
    }

    return res.status(400).json({
      error: "Unsupported file type. Allowed types are PDF and images (JPEG, PNG, WebP, GIF).",
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to upload file." });
  }
}

router.post("/upload", handleUpload);
router.post("/upload/resume", handleUpload);

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
  category: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  tags: z.array(z.object({ name: z.string(), color: z.string() })).optional(),
  image: z.string().optional().nullable(),
  sourceCodeLink: z.string().optional().nullable(),
  liveDemoLink: z.string().nullable().optional(),
  showOnHomepage: z.boolean().optional(),
  sortOrder: z.number().optional(),
});

router.post("/projects", (req: Request, res: Response) => {
  try {
    const parsed = ProjectSchema.parse(req.body);
    const category =
      parsed.category && parsed.category.trim() !== ""
        ? parsed.category.trim()
        : "Full-Stack";

    const result = db
      .insert(projects)
      .values({
        ...parsed,
        category,
        tags: parsed.tags ? JSON.stringify(parsed.tags) : undefined,
        liveDemoLink: parsed.liveDemoLink ?? undefined,
      })
      .run();
    return res.status(201).json({ id: result.lastInsertRowid, ...parsed, category });
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
    if (parsed.tags !== undefined) updateData.tags = JSON.stringify(parsed.tags);
    if (req.body.category !== undefined) {
      updateData.category =
        typeof req.body.category === "string" && req.body.category.trim() !== ""
          ? req.body.category.trim()
          : "Full-Stack";
    }
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

// ─── URL Validation Helper ───────────────────────────────────────────────────
function isValidUrl(urlStr: string): boolean {
  if (!urlStr || typeof urlStr !== "string") return false;
  const trimmed = urlStr.trim().toLowerCase();

  // Reject dangerous schemes
  if (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("vbscript:") ||
    trimmed.startsWith("file:")
  ) {
    return false;
  }

  // Support mailto:
  if (trimmed.startsWith("mailto:")) {
    const emailPart = trimmed.slice(7);
    return emailPart.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailPart);
  }

  // Standard HTTP / HTTPS
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// ─── Social Links ─────────────────────────────────────────────────────────────
const CreateSocialLinkSchema = z.object({
  platform: z.string().min(1, "Platform is required"),
  label: z.string().optional().nullable(),
  url: z.string().min(1, "URL is required"),
  icon: z.string().optional().nullable(),
  displayInContact: z.boolean().optional(),
  display_in_contact: z.boolean().optional(),
  displayInFooter: z.boolean().optional(),
  display_in_footer: z.boolean().optional(),
  sortOrder: z.number().optional(),
  sort_order: z.number().optional(),
  isActive: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

const UpdateSocialLinkSchema = z.object({
  platform: z.string().min(1).optional(),
  label: z.string().optional().nullable(),
  url: z.string().min(1).optional(),
  icon: z.string().optional().nullable(),
  displayInContact: z.boolean().optional(),
  display_in_contact: z.boolean().optional(),
  displayInFooter: z.boolean().optional(),
  display_in_footer: z.boolean().optional(),
  sortOrder: z.number().optional(),
  sort_order: z.number().optional(),
  isActive: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

router.get("/social-links", (_req: Request, res: Response) => {
  try {
    const rows = db
      .select()
      .from(socialLinks)
      .orderBy(asc(socialLinks.sortOrder), asc(socialLinks.id))
      .all();
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch social links" });
  }
});

router.post("/social-links", (req: Request, res: Response) => {
  try {
    const parsed = CreateSocialLinkSchema.parse(req.body);
    const platform = parsed.platform.trim().toLowerCase();
    const url = parsed.url.trim();

    if (!isValidUrl(url)) {
      return res.status(400).json({ error: "Invalid URL. Must be a valid HTTP, HTTPS, or mailto URL." });
    }

    const label =
      parsed.label && parsed.label.trim() !== ""
        ? parsed.label.trim()
        : platform.charAt(0).toUpperCase() + platform.slice(1);
    const icon = parsed.icon && parsed.icon.trim() !== "" ? parsed.icon.trim() : platform;
    const displayInContact = parsed.displayInContact ?? parsed.display_in_contact ?? false;
    const displayInFooter = parsed.displayInFooter ?? parsed.display_in_footer ?? true;
    const sortOrder = parsed.sortOrder ?? parsed.sort_order ?? 0;
    const isActive = parsed.isActive ?? parsed.is_active ?? true;
    const now = new Date().toISOString();

    const result = db
      .insert(socialLinks)
      .values({
        platform,
        label,
        url,
        icon,
        displayInContact,
        displayInFooter,
        sortOrder,
        isActive,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const id = Number(result.lastInsertRowid);
    const created = db.select().from(socialLinks).where(eq(socialLinks.id, id)).all()[0];
    return res.status(201).json(created);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Failed to create social link" });
  }
});

router.put("/social-links/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid link ID" });

    const existing = db.select().from(socialLinks).where(eq(socialLinks.id, id)).all();
    if (existing.length === 0) {
      return res.status(404).json({ error: "Social link not found" });
    }

    const parsed = UpdateSocialLinkSchema.parse(req.body);
    const updateData: Record<string, unknown> = {};

    if (parsed.platform !== undefined) updateData.platform = parsed.platform.trim().toLowerCase();
    if (parsed.label !== undefined) updateData.label = parsed.label;
    if (parsed.url !== undefined) {
      const url = parsed.url.trim();
      if (!isValidUrl(url)) {
        return res.status(400).json({ error: "Invalid URL. Must be a valid HTTP, HTTPS, or mailto URL." });
      }
      updateData.url = url;
    }
    if (parsed.icon !== undefined) updateData.icon = parsed.icon;

    const contactVal = parsed.displayInContact ?? parsed.display_in_contact;
    if (contactVal !== undefined) updateData.displayInContact = contactVal;

    const footerVal = parsed.displayInFooter ?? parsed.display_in_footer;
    if (footerVal !== undefined) updateData.displayInFooter = footerVal;

    const sortVal = parsed.sortOrder ?? parsed.sort_order;
    if (sortVal !== undefined) updateData.sortOrder = sortVal;

    const activeVal = parsed.isActive ?? parsed.is_active;
    if (activeVal !== undefined) updateData.isActive = activeVal;

    updateData.updatedAt = new Date().toISOString();

    db.update(socialLinks).set(updateData).where(eq(socialLinks.id, id)).run();
    const updated = db.select().from(socialLinks).where(eq(socialLinks.id, id)).all()[0];
    return res.json({ message: "Updated successfully", link: updated, socialLink: updated });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    return res.status(500).json({ error: "Failed to update social link" });
  }
});

router.delete("/social-links/:id", (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid link ID" });

    const existing = db.select().from(socialLinks).where(eq(socialLinks.id, id)).all();
    if (existing.length === 0) {
      return res.status(404).json({ error: "Social link not found" });
    }

    db.delete(socialLinks).where(eq(socialLinks.id, id)).run();
    return res.json({ success: true, message: "Deleted successfully", id });
  } catch {
    return res.status(500).json({ error: "Failed to delete social link" });
  }
});

// ─── Reorder (batch sortOrder) ────────────────────────────────────────────────
const ReorderSchema = z.object({ ids: z.array(z.number()) });

const REORDER_TABLE_MAP: Record<string, { table: any; idCol: any; sortCol: any }> = {
  nav_links: { table: navLinks, idCol: navLinks.id, sortCol: navLinks.sortOrder },
  social_links: { table: socialLinks, idCol: socialLinks.id, sortCol: socialLinks.sortOrder },
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
