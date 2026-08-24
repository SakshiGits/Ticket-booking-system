# Ticket Booking System

A full-stack ticket booking platform for movies and concerts: browsable catalog with
location/type filters, a visual seat map with live availability, TTL-based seat holds with
automatic release, race-safe concurrency on booking, a FIFO waitlist with time-limited
auto-offers on cancellation, and QR-coded email confirmations.

**Live app**: **[ticket-booking-web-xi.vercel.app](https://ticket-booking-web-xi.vercel.app)**
**Live API**: **[api-production-260b.up.railway.app](https://api-production-260b.up.railway.app)**
**Source**: **[github.com/SakshiGits/Ticket-booking-system](https://github.com/SakshiGits/Ticket-booking-system)**

Seeded logins (password `Password123!` for all): `customer@ticketbooking.dev` ·
`organiser@ticketbooking.dev` · `admin@ticketbooking.dev`

## Demo
https://github.com/user-attachments/assets/62b133cf-ca4f-4482-a611-4cc928b38ec0

## Table of contents

- [Demo](#demo)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup (local development)](#setup-local-development)
- [Environment variables](#environment-variables)
- [Database schema](#database-schema)
- [API reference](#api-reference)
- [Seat hold, concurrency & waitlist logic](#seat-hold-concurrency--waitlist-logic)
- [Full documentation](#full-documentation)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)

## Features

| Role | Capabilities |
|---|---|
| Customer | Browse/filter by type & location, view a live visual seat map, hold → checkout seats, view booking history, cancel a booking, join a waitlist, claim a time-limited waitlist offer |
| Organiser | Create movie/concert listings with poster & metadata, schedule shows with per-category pricing, view bookings & revenue per event |
| Admin | Create venues, define seat layouts (rows × categories) |

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Node.js + TypeScript + Express |
| Database | PostgreSQL + Prisma ORM |
| Cache / Jobs | Redis + BullMQ (TTL scheduling for holds & waitlist offers) |
| Real-time | Socket.IO |
| Auth | JWT, role-based (`CUSTOMER` / `ORGANISER` / `ADMIN`) |
| QR codes | `qrcode` |
| Email | Nodemailer (any SMTP provider — Resend/Brevo free tier work well) |
| Frontend | React + Vite + TypeScript + TailwindCSS |

Full rationale and dependency list: **[docs/tech-stack.md](docs/tech-stack.md)**.

## Project structure

```
apps/
  api/                    Backend
    prisma/schema.prisma  Full data model
    prisma/seed.ts        Seeds admin/organiser/customer + a multi-city catalog of movies & concerts
    src/
      modules/            One folder per domain: auth, venues, events, seats, bookings, waitlist, reports
      jobs/                BullMQ queues + workers (hold release, offer expiry, email) + sweep fallback
      realtime/            Socket.IO gateway
      middleware/, lib/, config/
  web/                    Frontend (React)
    src/pages/{customer,organiser,admin}
    src/components/seatmap, events, common
docker-compose.yml         Local Postgres + Redis
docs/                      Full documentation set — see below
```

## Prerequisites

- Node.js 18+
- Docker Desktop (for local Postgres + Redis) — or point `DATABASE_URL`/`REDIS_URL` at your own instances

## Setup (local development)

```bash
# 1. Install all workspace dependencies
npm install

# 2. Start Postgres + Redis
docker compose up -d
# Note: the compose file maps Postgres to host port 5433, not 5432 — this avoids clashing
# with a native Postgres install some machines already have listening on 5432.

# 3. Configure environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Edit apps/api/.env: set JWT_SECRET, and SMTP_* if you want real emails to send
# (leave SMTP_HOST blank to run with emails logged to console instead of sent)

# 4. Run migrations + seed sample data
npm run prisma:migrate    # applies apps/api/prisma/schema.prisma
npm run prisma:seed       # creates admin/organiser/customer + a sample catalog

# 5. Run everything (three processes — see note below on why it's two commands, not one)
npm run dev            # API + worker together, in one terminal
npm run dev:web        # frontend on :5173, in a second terminal
```

> **Why not one `npm run dev` for all three?** On Windows, launching `vite` (web) at the exact
> same moment as the `tsx`-based API/worker processes hits a resource race in esbuild's service
> startup and crashes (worse in a OneDrive-synced folder). `api` + `worker` together are stable —
> verified by running them concurrently repeatedly — so `dev` bundles those two, and `web` runs
> as a separate command. Not on Windows/OneDrive? `npm run dev:web` in its own terminal works the
> same either way.

Seeded accounts (password for all: `Password123!`):

| Email | Role |
|---|---|
| `admin@ticketbooking.dev` | Admin — venues & seat layouts |
| `organiser@ticketbooking.dev` | Organiser — events, shows, pricing, revenue |
| `customer@ticketbooking.dev` | Customer — browsing, booking, waitlist |

> **Note:** the worker is a separate `node` process from the API server — both must be running
> for holds/offers to actually expire (the API alone accepts holds but never releases them
> without the worker, aside from the fallback sweep that also lives in that process).

## Environment variables

Full list with inline comments: `apps/api/.env.example` and `apps/web/.env.example`. Key ones:

| Variable | Purpose |
|---|---|
| `SEAT_HOLD_TTL_MINUTES` | How long a seat hold lasts before auto-release (default 10) |
| `WAITLIST_OFFER_TTL_MINUTES` | How long a waitlist offer stays claimable (default 15) |
| `EXPIRY_SWEEP_INTERVAL_SECONDS` | Fallback sweep interval catching anything the scheduler missed (default 30) |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | Token signing key and session lifetime |
| `SMTP_*` | Any SMTP-compatible provider; blank `SMTP_HOST` logs emails to console instead of sending |
| `DATABASE_URL` / `REDIS_URL` | Connection strings for Postgres and Redis |

## Database schema

```
User ──< Venue (admin owns venues)
User ──< Event (organiser owns events)
Venue ──< VenueSeat            (fixed physical layout: row, number, category, x/y)
Event ──< Show                 (one bookable date/time at a venue)
Show ──< ShowCategory          (per-show pricing per category)
Show ──< ShowSeat              (per-show snapshot of every seat: THIS carries live status)
ShowSeat.status                AVAILABLE | HELD | BOOKED
User ──< Booking ──< ShowSeat  (a booking's seats, via ShowSeat.bookingId)
User ──< WaitlistEntry         (FIFO per show+category, status WAITING|OFFERED|EXPIRED|BOOKED|CANCELLED)
```

`ShowSeat` is the seat map: creating a `Show` snapshots every `VenueSeat` into a `ShowSeat` row
with `status=AVAILABLE`, so each show has its own independent, per-seat live state. `VenueSeat`
(the physical layout) is defined once per venue and reused by every show at that venue. Full
`schema.prisma` at `apps/api/prisma/schema.prisma`.

## API reference

All routes are prefixed `/api`, grouped by resource — Auth, Venues, Events & Shows, Seats,
Bookings, Waitlist, Reports — plus a Socket.IO channel for live seat-map updates. Full
request/response shapes, auth requirements, and error codes: **[docs/API.md](docs/API.md)**.

## Seat hold, concurrency & waitlist logic

**Seat hold & TTL.** Placing a hold runs a single conditional SQL update — `UPDATE show_seats
SET status='HELD', ... WHERE status='AVAILABLE'` — atomic in Postgres by construction. TTL
expiry is enforced two ways at once: a BullMQ delayed job scheduled at hold-time (the precise,
primary path), plus an independent periodic sweep that re-derives expired holds straight from
the database (the self-healing fallback, covering a lost job or worker restart). Both converge
on the same release function used for manual "abandon checkout," so there's one code path for
"a seat becomes available again."

**Concurrency protection.** That same conditional update *is* the concurrency guarantee — no
external lock needed. Two requests racing for one seat serialize at the Postgres row-lock level:
whichever commits first wins, and the second's `WHERE status='AVAILABLE'` simply matches zero
rows once it acquires the lock, since the row already changed. The API returns `409 Conflict`
for any seat that didn't flip. This was verified directly: concurrent hold requests fired at an
identical seat during development consistently resolved to exactly one success and one conflict.

**Waitlist auto-assignment.** A customer can only join a category's waitlist once it's
verifiably sold out. On cancellation, each freed seat is — inside the same transaction as the
cancellation — either handed straight to the earliest `WAITING` entry (FIFO) or released to
`AVAILABLE` if nobody's waiting. The seat is never observably available for even a moment when
someone's waiting for it. Claiming uses the identical atomic-conditional-update pattern as seat
holds, so concurrently-freed seats can never both be offered to the same waitlisted customer.

**Time-limited offers.** The claimed customer gets an emailed link with a single-use token,
valid for `WAITLIST_OFFER_TTL_MINUTES`, governed by the same dual-layer (job + sweep) TTL model
as holds. An expired, unclaimed offer isn't terminal — it recurses: the same seat is offered to
the next `WAITING` entry, and so on, until one is claimed or the queue empties.

Full mechanism-level write-up (design rationale, resilience decisions, a real bug this caught
during development): **[docs/system-design.md](docs/system-design.md)**.

## Full documentation

| Doc | Covers |
|---|---|
| [docs/API.md](docs/API.md) | Full API reference — every endpoint, auth/role requirements, request/response shapes, error codes, realtime events |
| [docs/system-design.md](docs/system-design.md) | Seat hold & TTL mechanism, concurrency prevention, waitlist auto-assignment, time-limited offer handling |
| [docs/requirements-compliance.md](docs/requirements-compliance.md) | Each technical requirement mapped to how it's implemented, verified against the running app |
| [docs/tech-stack.md](docs/tech-stack.md) | Full technology choices and dependency list, with rationale |
| [docs/architechturediagram.png](docs/architechturediagram.png) | System architecture diagram (Client / Application / Data / External layers) |

## Deployment

**Live**: **[https://ticket-booking-web-xi.vercel.app](https://ticket-booking-web-xi.vercel.app)**
(seeded logins: `customer@ticketbooking.dev` / `organiser@ticketbooking.dev` /
`admin@ticketbooking.dev`, password `Password123!` for all three).

- **API + worker + Postgres + Redis**: Railway, one project, four services from a single
  `railway.json` at the repo root:
  - `api` and `worker` deploy from the same GitHub-linked build (`npm install --include=dev &&
    npm run prisma:generate -w apps/api && npm run build -w apps/api`); which process runs is
    chosen at start by the `PROCESS_TYPE` env var (`worker`, or unset for the API) via
    `apps/api/src/start.ts` — one build config instead of maintaining two.
  - Managed `Postgres` and `Redis` add-ons, referenced by the app services via Railway's
    `${{Postgres.DATABASE_URL}}` / `${{Redis.REDIS_URL}}` variable syntax.
  - `npx prisma migrate deploy` runs as part of the start command, ahead of the server boot.
- **Frontend**: Vercel, building `apps/web` with `VITE_API_URL`/`VITE_SOCKET_URL` pointed at the
  Railway API's public domain. `apps/web/vercel.json` adds a catch-all rewrite to `index.html` —
  required for a client-side-routed SPA, otherwise a direct visit or refresh on any non-root
  route (e.g. `/login`) 404s.
- Verified end-to-end against the live URLs (not just individually): login, browse, seat hold,
  and the concurrency/TTL/waitlist mechanisms all confirmed working against the deployed
  Postgres/Redis, with zero console errors and zero failed network requests.

## Known limitations

- No payment gateway — the spec's input/output list never mentions payment, and "revenue per
  event" only requires summing confirmed booking amounts. Checkout is seats + customer details
  → confirmed booking.
- A seat hold that expires on a sold-out show doesn't currently trigger a waitlist offer (only
  explicit cancellation does, matching the spec) — a natural extension.
