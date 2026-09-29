import db from "./connection";
import {
  personal,
  navLinks,
  whatIBuilt,
  education,
  experiences,
  projects,
  testimonials,
  socialLinks,
} from "./schema";
import seedData from "../../seed.json";

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] [Seed] ${msg}`);
}

export async function runSeed() {
  log("Starting seed check...");

  // ── personal ────────────────────────────────────────────────────────────────
  const existingPersonal = db.select().from(personal).all();
  if (existingPersonal.length === 0) {
    const p = seedData.personal;
    db.insert(personal)
      .values({
        id: 1,
        name: p.name,
        title: p.title,
        email: p.email,
        salam: p.salam,
        salamMeaning: p.salamMeaning,
        roles: JSON.stringify(p.roles),
        aboutIntro: p.aboutIntro,
        portrait: p.portrait,
        resumeUrl: (p as any).resumeUrl ?? null,
      })
      .run();
    log("✅ Seeded: personal");
  } else {
    log("⏭️  Skipped: personal (already has data)");
  }

  // ── navLinks ─────────────────────────────────────────────────────────────────
  const existingNavLinks = db.select().from(navLinks).all();
  if (existingNavLinks.length === 0) {
    for (const link of seedData.navLinks) {
      db.insert(navLinks).values(link).run();
    }
    log("✅ Seeded: nav_links");
  } else {
    log("⏭️  Skipped: nav_links (already has data)");
  }

  // ── whatIBuilt ───────────────────────────────────────────────────────────────
  const existingWhatIBuilt = db.select().from(whatIBuilt).all();
  if (existingWhatIBuilt.length === 0) {
    for (const item of seedData.what_i_built) {
      db.insert(whatIBuilt)
        .values({
          number: item.number,
          title: item.title,
          description: item.description,
          tech: item.tech,
          iconType: item.iconType,
          isPrimary: item.isPrimary,
          showOnHomepage: item.showOnHomepage,
          sortOrder: item.sortOrder,
        })
        .run();
    }
    log("✅ Seeded: what_i_built");
  } else {
    log("⏭️  Skipped: what_i_built (already has data)");
  }

  // ── education ────────────────────────────────────────────────────────────────
  const existingEducation = db.select().from(education).all();
  if (existingEducation.length === 0) {
    for (const item of seedData.education) {
      db.insert(education)
        .values({
          title: item.title,
          institution: item.institution,
          result: item.result,
          date: item.date,
          icon: item.icon,
          image: (item as any).image ?? null,
          description: item.description,
          expectedGraduationYear: item.expectedGraduationYear ?? undefined,
          showOnHomepage: item.showOnHomepage,
          sortOrder: item.sortOrder,
        })
        .run();
    }
    log("✅ Seeded: education");
  } else {
    log("⏭️  Skipped: education (already has data)");
  }

  // ── experiences ──────────────────────────────────────────────────────────────
  const existingExperiences = db.select().from(experiences).all();
  if (existingExperiences.length === 0) {
    for (const item of seedData.experiences) {
      db.insert(experiences)
        .values({
          slug: item.slug,
          title: item.title,
          companyName: item.companyName,
          date: item.date,
          icon: item.icon,
          image: (item as any).image ?? null,
          iconBg: item.iconBg,
          points: JSON.stringify(item.points),
          showOnHomepage: item.showOnHomepage,
          sortOrder: item.sortOrder,
        })
        .run();
    }
    log("✅ Seeded: experiences");
  } else {
    log("⏭️  Skipped: experiences (already has data)");
  }

  // ── projects ─────────────────────────────────────────────────────────────────
  const existingProjects = db.select().from(projects).all();
  if (existingProjects.length === 0) {
    for (const item of seedData.projects) {
      db.insert(projects)
        .values({
          slug: item.slug,
          name: item.name,
          category: (item as any).category || "Full-Stack",
          description: item.description,
          tags: JSON.stringify(item.tags),
          image: item.image,
          sourceCodeLink: item.sourceCodeLink,
          liveDemoLink: item.liveDemoLink ?? undefined,
          showOnHomepage: item.showOnHomepage,
          sortOrder: item.sortOrder,
        })
        .run();
    }
    log("✅ Seeded: projects");
  } else {
    log("⏭️  Skipped: projects (already has data)");
  }

  // ── testimonials ─────────────────────────────────────────────────────────────
  const existingTestimonials = db.select().from(testimonials).all();
  if (existingTestimonials.length === 0) {
    for (const item of seedData.testimonials) {
      db.insert(testimonials)
        .values({
          testimonial: item.testimonial,
          name: item.name,
          designation: item.designation,
          company: item.company,
          image: item.image,
          showOnHomepage: item.showOnHomepage,
          sortOrder: item.sortOrder,
        })
        .run();
    }
    log("✅ Seeded: testimonials");
  } else {
    log("⏭️  Skipped: testimonials (already has data)");
  }

  // ── socialLinks ──────────────────────────────────────────────────────────────
  const existingSocialLinks = db.select().from(socialLinks).all();
  if (existingSocialLinks.length === 0) {
    const now = new Date().toISOString();
    const links = (seedData as any).socialLinks || [];
    for (const item of links) {
      db.insert(socialLinks)
        .values({
          platform: item.platform,
          label: item.label,
          url: item.url,
          icon: item.icon,
          displayInContact: item.displayInContact ?? false,
          displayInFooter: item.displayInFooter ?? true,
          sortOrder: item.sortOrder ?? 0,
          isActive: item.isActive ?? true,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
    log("✅ Seeded: social_links");
  } else {
    log("⏭️  Skipped: social_links (already has data)");
  }

  log("Seed complete.");
}
