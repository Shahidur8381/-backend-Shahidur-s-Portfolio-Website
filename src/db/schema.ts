import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

// ─── personal ────────────────────────────────────────────────────────────────
export const personal = sqliteTable("personal", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title"),
  email: text("email"),
  salam: text("salam"),
  salamMeaning: text("salamMeaning"),
  roles: text("roles"), // JSON stringified array
  aboutIntro: text("aboutIntro"),
  portrait: text("portrait"),
});

// ─── nav_links ────────────────────────────────────────────────────────────────
export const navLinks = sqliteTable("nav_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  navId: text("navId").notNull().unique(),
  title: text("title").notNull(),
  sortOrder: integer("sortOrder").default(0),
});

// ─── what_i_built ─────────────────────────────────────────────────────────────
export const whatIBuilt = sqliteTable("what_i_built", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  number: text("number"),
  title: text("title").notNull(),
  description: text("description"),
  tech: text("tech"),
  iconType: text("iconType"),
  isPrimary: integer("isPrimary", { mode: "boolean" }).default(false),
  showOnHomepage: integer("showOnHomepage", { mode: "boolean" }).default(true),
  sortOrder: integer("sortOrder").default(0),
});

// ─── education ────────────────────────────────────────────────────────────────
export const education = sqliteTable("education", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  institution: text("institution").notNull(),
  result: text("result"),
  date: text("date"),
  icon: text("icon"),
  description: text("description"),
  expectedGraduationYear: integer("expectedGraduationYear"),
  showOnHomepage: integer("showOnHomepage", { mode: "boolean" }).default(true),
  sortOrder: integer("sortOrder").default(0),
});

// ─── experiences ──────────────────────────────────────────────────────────────
export const experiences = sqliteTable("experiences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  companyName: text("companyName").notNull(),
  date: text("date"),
  icon: text("icon"),
  iconBg: text("iconBg"),
  points: text("points"), // JSON stringified array
  showOnHomepage: integer("showOnHomepage", { mode: "boolean" }).default(true),
  sortOrder: integer("sortOrder").default(0),
});

// ─── projects ─────────────────────────────────────────────────────────────────
export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  tags: text("tags"), // JSON stringified array of {name, color}
  image: text("image"),
  sourceCodeLink: text("sourceCodeLink"),
  liveDemoLink: text("liveDemoLink"),
  showOnHomepage: integer("showOnHomepage", { mode: "boolean" }).default(true),
  sortOrder: integer("sortOrder").default(0),
});

// ─── testimonials ─────────────────────────────────────────────────────────────
export const testimonials = sqliteTable("testimonials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  testimonial: text("testimonial").notNull(),
  name: text("name").notNull(),
  designation: text("designation"),
  company: text("company"),
  image: text("image"),
  showOnHomepage: integer("showOnHomepage", { mode: "boolean" }).default(true),
  sortOrder: integer("sortOrder").default(0),
});

// ─── admin_config ─────────────────────────────────────────────────────────────
export const adminConfig = sqliteTable("admin_config", {
  id: integer("id").primaryKey(),
  totpSecret: text("totpSecret").notNull(),
  label: text("label").default("PortfolioAdmin"),
});
