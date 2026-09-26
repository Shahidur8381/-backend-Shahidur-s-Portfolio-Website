import { Router, Request, Response } from "express";
import { eq } from "drizzle-orm";
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
import { totpAuth } from "../middleware/auth";

const router = Router();

// Apply TOTP auth to ALL admin routes
router.use(totpAuth);

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

// ─── Personal ─────────────────────────────────────────────────────────────────
const PersonalSchema = z.object({
  name: z.string().optional(),
  title: z.string().optional(),
  email: z.string().optional(),
  salam: z.string().optional(),
  salamMeaning: z.string().optional(),
  roles: z.array(z.string()).optional(),
  aboutIntro: z.string().optional(),
  portrait: z.string().optional(),
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
  result: z.string().optional(),
  date: z.string().optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
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
  date: z.string().optional(),
  icon: z.string().optional(),
  iconBg: z.string().optional(),
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
