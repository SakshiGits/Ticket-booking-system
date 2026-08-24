# Tech Stack & Dependencies

## Architecture summary

A TypeScript monorepo (npm workspaces) split into two deployables — `apps/api` (REST API +
background worker, run as separate processes from one codebase) and `apps/web` (SPA) — backed by
managed PostgreSQL and Redis. See [architechturediagram.png](architechturediagram.png) for the
full architecture diagram and [system-design.md](system-design.md) for the mechanism-level design
rationale.

---

## Backend — `apps/api`

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js (TypeScript, strict mode) | Type safety across the whole request lifecycle; shared language with the frontend |
| Web framework | Express 4 | Minimal, well-understood, unopinionated routing for a resource-oriented REST API |
| ORM / migrations | Prisma 5 | Type-safe query builder generated from a single schema; first-class migration tooling; transaction API used throughout for atomicity |
| Database | PostgreSQL | ACID transactions and row-level locking are the entire concurrency-safety mechanism this system relies on — see [system-design.md §2](system-design.md#2-concurrency-prevention) |
| Job queue | BullMQ (Redis-backed) | Delayed jobs implement seat-hold and waitlist-offer TTLs without polling |
| Cache / broker | Redis (via `ioredis`) | Backs BullMQ and is the natural pub/sub layer alongside Socket.IO |
| Realtime | Socket.IO | Room-based (`show:{id}`) broadcast of live seat-status changes to every connected client |
| Auth | `jsonwebtoken` + `bcryptjs` | Stateless bearer JWTs; salted password hashing |
| Validation | Zod | Schema-first request validation; a `ZodError` maps to a structured `400` response rather than leaking as a `500` |
| QR generation | `qrcode` | Encodes the booking reference as a data-URL PNG, embedded in the confirmation email |
| Email | Nodemailer | SMTP-agnostic — works with any free-tier transactional provider (Resend, Brevo, Mailtrap, …) via env vars only |
| Security middleware | `helmet`, `cors`, `express-rate-limit` | Standard HTTP security headers, CORS allow-list, coarse per-IP abuse throttling |
| Dev runtime | `tsx` | Fast TS execution + watch mode without a separate build step in development |

### Dependencies (production)

| Package | Version | Purpose |
|---|---|---|
| `@prisma/client` | ^5.20 | Generated, type-safe database client |
| `bcryptjs` | ^2.4 | Password hashing |
| `bullmq` | ^5.12 | Redis-backed job queues (hold release, offer expiry, email) |
| `cors` | ^2.8 | Cross-origin request handling |
| `dotenv` | ^16.4 | `.env` file loading |
| `express` | ^4.19 | HTTP server / routing |
| `express-rate-limit` | ^7.4 | Per-IP request throttling |
| `helmet` | ^7.1 | Security-related HTTP headers |
| `ioredis` | ^5.4 | Redis client (BullMQ connection, general use) |
| `jsonwebtoken` | ^9.0 | JWT signing/verification |
| `nodemailer` | ^6.9 | SMTP email delivery |
| `qrcode` | ^1.5 | QR code image generation |
| `socket.io` | ^4.7 | WebSocket server for realtime seat updates |
| `uuid` | ^9.0 | Random token generation (waitlist offer tokens) |
| `zod` | ^3.23 | Runtime schema validation |

### Dependencies (development)

`prisma` (CLI/migrations), `typescript`, `tsx` (dev runtime), plus `@types/*` packages for every
untyped dependency above.

---

## Frontend — `apps/web`

| Layer | Choice | Why |
|---|---|---|
| Framework | React 18 (TypeScript) | Component model fits the seat-grid/booking-flow UI well; broad ecosystem |
| Build tool | Vite 5 | Fast dev server + HMR, minimal config, esbuild-based production builds |
| Routing | React Router 6 | Standard client-side routing, nested/protected routes |
| Styling | Tailwind CSS 3 | Utility-first styling enabled a full dark-theme redesign without a component library dependency; custom design tokens (colors, fonts) defined in `tailwind.config.js` |
| HTTP client | Axios | Interceptor support used for automatic bearer-token attachment and centralized 401 handling |
| Realtime client | `socket.io-client` | Matches the server's Socket.IO transport for live seat-map updates |
| Fonts | Google Fonts (Inter, Bebas Neue) | Inter for body text, Bebas Neue for cinema-marquee-style display headings |

### Dependencies (production)

| Package | Version | Purpose |
|---|---|---|
| `axios` | ^1.7 | HTTP client with interceptors |
| `react` / `react-dom` | ^18.3 | UI framework |
| `react-router-dom` | ^6.26 | Client-side routing |
| `socket.io-client` | ^4.7 | Realtime seat-map subscription |

### Dependencies (development)

`vite`, `@vitejs/plugin-react`, `typescript`, `tailwindcss`, `postcss`, `autoprefixer`,
`@types/react`, `@types/react-dom`.

---

## Infrastructure & tooling

| Concern | Choice | Notes |
|---|---|---|
| Monorepo management | npm workspaces (`apps/*`) | No extra tooling (Turborepo/Nx) needed at this scale |
| Local dev services | Docker Compose | Postgres 16 + Redis 7 containers for local development, mirroring production topology |
| Combined dev script | `concurrently` | Runs API + worker together in one terminal; the frontend runs separately due to a Windows/esbuild resource-race when all three start at once (documented in the README) |
| Hosting (live) | Railway (API + worker + managed Postgres + managed Redis), Vercel (frontend) | Free-tier friendly; API and worker deploy as two services from the same build so the worker can scale/restart independently of the API |

---

## Why this stack, briefly

- **PostgreSQL over a NoSQL store**: the core requirement — "simultaneous attempts for the same
  seat must not both succeed" — is a textbook transactional-integrity problem. A relational
  database with row-level locking solves it with a single conditional statement; a document store
  would require reimplementing that guarantee at the application layer.
- **BullMQ + Redis over a naive `setTimeout`**: TTL scheduling must survive process restarts.
  Delayed jobs persisted in Redis do; in-memory timers don't.
- **Prisma over a raw query builder**: the schema is the single source of truth for both the
  database migrations and the TypeScript types used throughout the API — eliminating an entire
  class of type-drift bugs between the DB and the code.
- **Socket.IO over polling**: seat status must feel instant to every customer viewing a show,
  not just the one who acted — a room-scoped broadcast is the natural fit.
