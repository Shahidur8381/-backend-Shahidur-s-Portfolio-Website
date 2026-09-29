<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white&style=for-the-badge" />
  <img src="https://img.shields.io/badge/Express-000000?logo=express&logoColor=white&style=for-the-badge" />
  <img src="https://img.shields.io/badge/SQLite-003B57?logo=sqlite&logoColor=white&style=for-the-badge" />
  <img src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white&style=for-the-badge" />
  <img src="https://img.shields.io/badge/Drizzle_ORM-C5F74F?logo=drizzle&logoColor=black&style=for-the-badge" />
</p>

<h1 align="center">shahidur.dev — Backend API</h1>

<p align="center">
  Production-grade REST API that powers <a href="https://shahidur.dev">shahidur.dev</a> and its admin panel.<br/>
  Manages all portfolio content — personal info, projects, experience, education, testimonials, social links — through a fully authenticated CMS backend with file uploads, TOTP auth, and automated CI/CD.
</p>

<p align="center">
  <b>🌐 Live:</b> <a href="https://api.shahidur.dev">api.shahidur.dev</a> &nbsp;|&nbsp;
  <b>🖥 Frontend:</b> <a href="https://github.com/Shahidur8381/Portfolio---shahidur.dev">shahidur.dev</a> &nbsp;|&nbsp;
  <b>🔧 Admin:</b> <a href="https://github.com/Shahidur8381/Admin---shahidur.dev">admin.shahidur.dev</a>
</p>

---

## ✨ Features

### 🔐 Authentication & Session Management
- **TOTP-based login** — Authenticate via Google Authenticator (6-digit codes, SHA1, 30s period)
- **Session tokens** — Login generates a 60-minute Bearer token; no need to send TOTP on every request
- **Dual auth modes** — Supports both `Bearer <token>` (session) and `TOTP <code>` (direct) in the `Authorization` header
- **Session lifecycle** — Login, verify, logout, and destroy-all-sessions endpoints
- **One-time TOTP setup** — Secure `/api/setup/totp` endpoint (protected by `X-Setup-Key`) to bootstrap authentication

### 📝 Full CMS — CRUD for Everything
Every section of the portfolio is fully manageable via REST endpoints:

| Section | Public Read | Admin CRUD | Reorder |
|---|:---:|:---:|:---:|
| **Personal Info** | ✅ | ✅ (PUT) | — |
| **Nav Links** | ✅ | ✅ | ✅ |
| **What I Built** (capabilities) | ✅ | ✅ | ✅ |
| **Education** | ✅ | ✅ | ✅ |
| **Experiences** | ✅ | ✅ | ✅ |
| **Projects** | ✅ | ✅ | ✅ |
| **Testimonials** | ✅ | ✅ | ✅ |
| **Social Links** | ✅ | ✅ | ✅ |

### 📦 All-in-One Portfolio Endpoint
`GET /api/portfolio` returns the **entire portfolio** in a single request — personal info, nav links, social links, capabilities, education, experiences, projects, and testimonials — optimized for SSR/SSG front-end consumption.

### 🏠 Homepage Filtering
All list endpoints support `?homepage=true` to return only items marked `showOnHomepage: true`, so the front-end can render the homepage without fetching everything.

### 🔄 Drag-and-Drop Reordering
`PUT /api/admin/reorder/:table` accepts an ordered array of IDs and batch-updates `sortOrder` for any content table — enabling drag-and-drop reordering in the admin panel.

### 📤 Secure File Uploads
- **Image uploads** — JPEG, PNG, WebP, GIF with magic-byte validation
- **Resume/PDF uploads** — Validates `%PDF-` signature; rejects spoofed files
- **Security hardening** — Blocks dangerous extensions (`.exe`, `.sh`, `.svg`, `.html`, etc.), validates MIME types, and sanitizes filenames
- **Dual upload modes** — Base64 JSON body or raw `application/pdf` binary with `X-Filename` header
- **Static file serving** — Uploaded files served at `/uploads/*` with auto-generated collision-safe filenames

### 🛡️ Security
- **Rate limiting** on admin routes (configurable via `ADMIN_RATE_LIMIT`)
- **CORS whitelist** — Only allowed origins can hit the API (configurable comma-separated list)
- **Input validation** — Every endpoint uses [Zod](https://zod.dev) schemas for strict request validation
- **URL sanitization** — Social link URLs are validated against `javascript:`, `data:`, `vbscript:`, and `file:` injection
- **Proxy-aware** — `trust proxy` enabled for correct IP detection behind reverse proxies

### 🗄️ Database
- **SQLite** via [better-sqlite3](https://github.com/JoshuaWise/better-sqlite3) — zero-config, embedded, production-fast
- **Drizzle ORM** — Type-safe schema, migrations, and queries
- **Auto-migration** — Runs Drizzle migrations on startup; includes safe `ALTER TABLE` fallbacks for schema evolution
- **Auto-seeding** — Populates initial data from `seed.json` on first run (idempotent)
- **Persistent volume** — Database stored in Docker volume at `/app/data/portfolio.db`

### 🐳 Docker & Deployment
- **Multi-stage Dockerfile** — Builder stage compiles TypeScript + native modules; production stage is minimal Alpine
- **Docker Compose** — One-command deployment with persistent volumes and structured logging
- **Health checks** — Built-in `HEALTHCHECK` hitting `/api/health` every 30s
- **GitHub Actions CI/CD** — Push to `main` → SSH into VPS → `git pull` + `docker compose build` + `docker compose up -d`

---

## 🏗️ Architecture

```
src/
├── index.ts              # App bootstrap — CORS, body parsing, rate limiting, migrations, seeding
├── db/
│   ├── connection.ts     # SQLite connection (better-sqlite3 + Drizzle)
│   ├── schema.ts         # All table definitions (9 tables)
│   └── seed.ts           # Idempotent database seeder from seed.json
├── routes/
│   ├── public.ts         # Read-only endpoints — /api/portfolio, /api/projects, etc.
│   └── admin.ts          # Authenticated CRUD — /api/admin/* (login, uploads, full CMS)
├── middleware/
│   └── auth.ts           # Bearer token + TOTP verification middleware
└── utils/
    ├── totp.ts           # TOTP secret generation & verification (otpauth)
    └── upload.ts         # Upload directory configuration
```

---

## 📡 API Reference

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check (uptime, timestamp) |
| `GET` | `/api/portfolio` | All portfolio data in one response |
| `GET` | `/api/personal` | Personal info (name, title, roles, bio) |
| `GET` | `/api/nav-links` | Navigation links |
| `GET` | `/api/social-links` | Active social links |
| `GET` | `/api/what-i-built` | Capabilities / services |
| `GET` | `/api/education` | Education history |
| `GET` | `/api/experiences` | Work experience |
| `GET` | `/api/projects` | Project showcase |
| `GET` | `/api/testimonials` | Client testimonials |

> All list endpoints support `?homepage=true` for filtered results.

### Admin Endpoints (`/api/admin/*`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/admin/login` | — | Exchange TOTP code for session token |
| `GET` | `/admin/verify` | ✅ | Check session validity & remaining time |
| `POST` | `/admin/logout` | ✅ | Destroy current session |
| `POST` | `/admin/destroy-all-sessions` | ✅ | Revoke all active sessions |
| `PUT` | `/admin/personal` | ✅ | Update personal info |
| `POST` | `/admin/upload` | ✅ | Upload image (base64 or binary) |
| `POST` | `/admin/upload/resume` | ✅ | Upload resume PDF |
| `POST/PUT/DELETE` | `/admin/nav-links[/:id]` | ✅ | Manage nav links |
| `POST/PUT/DELETE` | `/admin/what-i-built[/:id]` | ✅ | Manage capabilities |
| `POST/PUT/DELETE` | `/admin/education[/:id]` | ✅ | Manage education |
| `POST/PUT/DELETE` | `/admin/experiences[/:id]` | ✅ | Manage experiences |
| `POST/PUT/DELETE` | `/admin/projects[/:id]` | ✅ | Manage projects |
| `POST/PUT/DELETE` | `/admin/testimonials[/:id]` | ✅ | Manage testimonials |
| `GET/POST/PUT/DELETE` | `/admin/social-links[/:id]` | ✅ | Manage social links |
| `PUT` | `/admin/reorder/:table` | ✅ | Batch reorder any table |

### Setup Endpoint

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/setup/totp` | `X-Setup-Key` | Generate TOTP secret (one-time setup) |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 20 (Alpine) |
| **Language** | TypeScript 5 |
| **Framework** | Express 4 |
| **Database** | SQLite (better-sqlite3) |
| **ORM** | Drizzle ORM |
| **Validation** | Zod |
| **Authentication** | OTPAuth (TOTP / Google Authenticator) |
| **Security** | express-rate-limit, CORS, input sanitization |
| **Build** | tsup (esbuild-powered bundler) |
| **Dev** | tsx (TypeScript execution with watch mode) |
| **Container** | Docker (multi-stage Alpine) |
| **Orchestration** | Docker Compose |
| **CI/CD** | GitHub Actions → SSH deploy |
| **Reverse Proxy** | Caddy |

---

## 🚀 Getting Started

### Prerequisites
- Node.js ≥ 20
- npm

### Local Development

```bash
# Clone the repo
git clone https://github.com/Shahidur8381/backend-Shahidur-s-Portfolio-Website.git
cd backend-Shahidur-s-Portfolio-Website

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your values

# Push database schema
npm run db:push

# Seed initial data
npm run seed

# Start dev server (hot reload)
npm run dev
```

The API will be running at `http://localhost:4000`.

### Docker Deployment

```bash
# Configure environment
cp .env.example .env
# Edit .env with your TOTP_SHARED_SECRET and CORS_ORIGIN

# Build & run
docker compose up -d --build

# Check logs
docker compose logs -f portfolio-api
```

---

## ⚙️ Environment Variables

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `PORT` | No | `4000` | Server port |
| `DATABASE_URL` | No | `/app/data/portfolio.db` | SQLite database path |
| `SETUP_KEY` | Yes | — | Secret key for initial TOTP setup |
| `TOTP_SHARED_SECRET` | Yes | — | Base32 TOTP secret (from setup endpoint) |
| `CORS_ORIGIN` | Yes | `http://localhost:3000` | Comma-separated allowed origins |
| `PUBLIC_BASE_URL` | No | `https://api.shahidur.dev` | Base URL for uploaded file URLs |
| `ADMIN_RATE_LIMIT` | No | `100` | Max admin requests per minute |

---

## 🔗 Ecosystem

This backend is one part of a three-repo system:

| Repo | Domain | Description |
|------|--------|-------------|
| [**Portfolio Frontend**](https://github.com/Shahidur8381/Portfolio---shahidur.dev) | [shahidur.dev](https://shahidur.dev) | Public-facing 3D portfolio website |
| [**Admin Panel**](https://github.com/Shahidur8381/Admin---shahidur.dev) | [admin.shahidur.dev](https://admin.shahidur.dev) | CMS dashboard for managing all content |
| [**Backend API**](https://github.com/Shahidur8381/backend-Shahidur-s-Portfolio-Website) | [api.shahidur.dev](https://api.shahidur.dev) | This repo — REST API powering both apps |

---

## 📜 License

Private project by [Shahidur Rahman](https://shahidur.dev).
