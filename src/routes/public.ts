import { Router, Request, Response } from "express";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import db from "../db/connection";
import {
  personal,
  navLinks,
  whatIBuilt,
  education,
  experiences,
  projects,
  testimonials,
} from "../db/schema";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJSON<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function homepageFilter(query: Record<string, unknown>) {
  return query.homepage === "true";
}

// ─── GET /api/health ──────────────────────────────────────────────────────────
router.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ─── GET /api/personal ────────────────────────────────────────────────────────
router.get("/personal", (_req: Request, res: Response) => {
  try {
    const rows = db.select().from(personal).all();
    if (rows.length === 0) return res.json(null);
    const row = rows[0];
    return res.json({
      ...row,
      roles: parseJSON<string[]>(row.roles, []),
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch personal info" });
  }
});

// ─── GET /api/nav-links ───────────────────────────────────────────────────────
router.get("/nav-links", (_req: Request, res: Response) => {
  try {
    const rows = db.select().from(navLinks).orderBy(asc(navLinks.sortOrder)).all();
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Failed to fetch nav links" });
  }
});

// ─── GET /api/what-i-built ────────────────────────────────────────────────────
router.get("/what-i-built", (req: Request, res: Response) => {
  try {
    let query = db.select().from(whatIBuilt).orderBy(asc(whatIBuilt.sortOrder));
    const rows = homepageFilter(req.query)
      ? db
          .select()
          .from(whatIBuilt)
          .where(eq(whatIBuilt.showOnHomepage, true))
          .orderBy(asc(whatIBuilt.sortOrder))
          .all()
      : query.all();
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Failed to fetch capabilities" });
  }
});

// ─── GET /api/education ───────────────────────────────────────────────────────
router.get("/education", (req: Request, res: Response) => {
  try {
    const rows = homepageFilter(req.query)
      ? db
          .select()
          .from(education)
          .where(eq(education.showOnHomepage, true))
          .orderBy(asc(education.sortOrder))
          .all()
      : db.select().from(education).orderBy(asc(education.sortOrder)).all();
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Failed to fetch education" });
  }
});

// ─── GET /api/experiences ─────────────────────────────────────────────────────
router.get("/experiences", (req: Request, res: Response) => {
  try {
    const rows = homepageFilter(req.query)
      ? db
          .select()
          .from(experiences)
          .where(eq(experiences.showOnHomepage, true))
          .orderBy(asc(experiences.sortOrder))
          .all()
      : db.select().from(experiences).orderBy(asc(experiences.sortOrder)).all();
    return res.json(
      rows.map((r) => ({ ...r, points: parseJSON<string[]>(r.points, []) }))
    );
  } catch {
    return res.status(500).json({ error: "Failed to fetch experiences" });
  }
});

// ─── Project Schema & Endpoints ───────────────────────────────────────────────
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

// ─── GET /api/projects ────────────────────────────────────────────────────────
router.get("/projects", (req: Request, res: Response) => {
  try {
    const rows = homepageFilter(req.query)
      ? db
          .select()
          .from(projects)
          .where(eq(projects.showOnHomepage, true))
          .orderBy(asc(projects.sortOrder))
          .all()
      : db.select().from(projects).orderBy(asc(projects.sortOrder)).all();
    return res.json(
      rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        category: r.category || "Full-Stack",
        description: r.description,
        image: r.image,
        tags: parseJSON<unknown[]>(r.tags, []),
        sourceCodeLink: r.sourceCodeLink,
        liveDemoLink: r.liveDemoLink,
        showOnHomepage: r.showOnHomepage,
        sortOrder: r.sortOrder,
      }))
    );
  } catch {
    return res.status(500).json({ error: "Failed to fetch projects" });
  }
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
    return res.status(201).json({ id: Number(result.lastInsertRowid), ...parsed, category });
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

// ─── GET /api/testimonials ────────────────────────────────────────────────────
router.get("/testimonials", (req: Request, res: Response) => {
  try {
    const rows = homepageFilter(req.query)
      ? db
          .select()
          .from(testimonials)
          .where(eq(testimonials.showOnHomepage, true))
          .orderBy(asc(testimonials.sortOrder))
          .all()
      : db.select().from(testimonials).orderBy(asc(testimonials.sortOrder)).all();
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Failed to fetch testimonials" });
  }
});

// ─── GET /api/portfolio (all-in-one) ─────────────────────────────────────────
router.get("/portfolio", (_req: Request, res: Response) => {
  try {
    const personalRows = db.select().from(personal).all();
    const personalData = personalRows[0]
      ? {
          ...personalRows[0],
          roles: parseJSON<string[]>(personalRows[0].roles, []),
        }
      : null;

    const navLinksData = db.select().from(navLinks).orderBy(asc(navLinks.sortOrder)).all();

    const capabilitiesData = db.select().from(whatIBuilt).orderBy(asc(whatIBuilt.sortOrder)).all();

    const educationData = db.select().from(education).orderBy(asc(education.sortOrder)).all();

    const experiencesData = db
      .select()
      .from(experiences)
      .orderBy(asc(experiences.sortOrder))
      .all()
      .map((r) => ({ ...r, points: parseJSON<string[]>(r.points, []) }));

    const projectsData = db
      .select()
      .from(projects)
      .orderBy(asc(projects.sortOrder))
      .all()
      .map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        category: r.category || "Full-Stack",
        description: r.description,
        image: r.image,
        tags: parseJSON<unknown[]>(r.tags, []),
        sourceCodeLink: r.sourceCodeLink,
        liveDemoLink: r.liveDemoLink,
        showOnHomepage: r.showOnHomepage,
        sortOrder: r.sortOrder,
      }));

    const testimonialsData = db
      .select()
      .from(testimonials)
      .orderBy(asc(testimonials.sortOrder))
      .all();

    return res.json({
      personal: personalData,
      navLinks: navLinksData,
      whatIBuilt: capabilitiesData,
      education: educationData,
      experiences: experiencesData,
      projects: projectsData,
      testimonials: testimonialsData,
    });
  } catch {
    return res.status(500).json({ error: "Failed to fetch portfolio data" });
  }
});

export default router;
