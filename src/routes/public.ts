import { Router, Request, Response } from "express";
import { eq, asc } from "drizzle-orm";
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
      rows.map((r) => ({ ...r, tags: parseJSON<unknown[]>(r.tags, []) }))
    );
  } catch {
    return res.status(500).json({ error: "Failed to fetch projects" });
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
      .map((r) => ({ ...r, tags: parseJSON<unknown[]>(r.tags, []) }));

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
