# Technical Requirements — Compliance Report



### ✅ Backend API, Frontend, Database with role-based auth (customer / organiser / admin)

Three-tier architecture: an Express + TypeScript REST API (`apps/api`), a React + TypeScript SPA
(`apps/web`), and a PostgreSQL database accessed through Prisma ORM. Authentication is stateless
JWT — a signed token carries `{ sub, role, email }` and is verified per-request by an
`authenticate` middleware; authorization is enforced by a composable `requireRole(...)` guard
applied per-route (`apps/api/src/middleware/auth.ts`). Public self-registration is restricted by
schema validation (Zod enum) to `CUSTOMER` and `ORGANISER` only — `ADMIN` accounts are
provisioned out-of-band via the seed script, never through a public endpoint, closing the
obvious privilege-escalation path. Every role/ownership boundary (10+ route combinations, plus
cross-tenant ownership checks on bookings, events, and venues) was verified directly against a
running instance during development, not merely assumed from the code.

### Seat map stored per show with per-seat status; rendered as visual grid on frontend

Seat state is modeled per show, not per venue: creating a `Show` snapshots the venue's physical
`VenueSeat` layout into `ShowSeat` rows scoped to that show, each carrying a live `status` enum
(`AVAILABLE` / `HELD` / `BOOKED`), `heldBy`, and `holdExpiresAt` (`prisma/schema.prisma`). This
gives every show an independent seat map even when multiple shows share a venue. The frontend
renders this as an interactive grid component (`SeatGrid.tsx`) grouped by row, color-coded by
status, with click-to-select — subscribed to a Socket.IO room per show so every connected client
repaints in real time as seats are held, released, or booked by anyone else.

### Seat hold TTL enforced via scheduler or database-level expiry; seat status updated on release

Implemented with both mechanisms simultaneously, not just one: a Redis-backed delayed job
(BullMQ) fires at the exact TTL boundary as the primary, precise release path, guarded so it only
acts if the hold is still active *and* genuinely expired (preventing a stale job from clobbering
a fresher hold on the same seat). A second, independent reconciliation sweep runs on a fixed
interval and re-derives expired holds directly from PostgreSQL, providing self-healing recovery
from a dropped job, a worker restart, or a queue outage. Both converge on the identical
state-transition function used for manual "abandon checkout" release, so there is exactly one
code path for "a seat becomes available again," regardless of trigger. TTL is fully
configurable via `SEAT_HOLD_TTL_MINUTES`.

### Concurrency protection on seat hold and booking — simultaneous attempts for the same seat must not both succeed

Enforced at the data layer via a single conditional `UPDATE ... WHERE status = 'AVAILABLE'`
per hold or checkout request — no distributed lock, semaphore, or optimistic-retry loop
required. This is inherently row-serializing under PostgreSQL's transactional isolation: a
second request racing for an already-claimed seat sees the first request's committed state
before its own condition is evaluated and simply affects zero rows, which the API surfaces as a
deterministic `409 Conflict`. Checkout re-validates ownership, status, and non-expiry a second
time, atomically, at commit — closing the residual race window between reading a hold and
finalizing a booking. This guarantee was not just designed but *proven*: concurrent hold requests
fired in parallel at an identical seat during development consistently resolved to exactly one
winner and zero double-bookings.

### Waitlist queue per seat category; auto-assignment and time-limited offer flow on cancellation

`WaitlistEntry` rows form a strict FIFO queue scoped per `(show, category)` pair, with
server-side eligibility enforcement — joining is only permitted once a category is verifiably
exhausted of `AVAILABLE` inventory. On cancellation, seat release and waitlist reassignment
happen inside the *same* database transaction: the freed seat is atomically claimed by the
earliest waiting entry (via the identical claim-and-verify pattern used for seat holds) and
transitions straight from `BOOKED` to `HELD` for that customer — it is never observably
`AVAILABLE` to the general public. The claimant receives an emailed, single-use offer token with
its own TTL (`WAITLIST_OFFER_TTL_MINUTES`), governed by the same dual-layer expiry model (delayed
job + sweep) as seat holds. An unclaimed, expired offer is not terminal — it recursively re-enters
the same assignment routine against the next queued entry until one is claimed or the queue is
exhausted.

### QR code generation on booking; email delivery with QR code (any free tier service)

On checkout, a QR code encoding the booking reference is generated server-side (`qrcode` package,
`lib/qrcode.ts`) and persisted to the booking record *before* any email send is attempted —
decoupling ticket validity from email deliverability, so a transient SMTP failure never leaves a
confirmed booking without its QR. Delivery is handled asynchronously by a BullMQ-backed worker
process via Nodemailer against any SMTP-compatible provider (Resend, Brevo, etc., configured
purely through environment variables — no vendor lock-in). The same infrastructure sends
waitlist-offer emails with the time-limited claim link.

---

## Summary

| Requirement | Status | Primary mechanism |
|---|---|---|
| Backend / Frontend / DB + RBAC | ✅ | Express + React + PostgreSQL, JWT + role middleware |
| Per-show seat map, visual grid | ✅ | `ShowSeat` snapshot model + Socket.IO + `SeatGrid.tsx` |
| Hold TTL, scheduler or DB-level | ✅ (both) | BullMQ delayed job + periodic reconciliation sweep |
| Concurrency protection | ✅ | Atomic conditional `UPDATE`, verified under live race conditions |
| Waitlist + time-limited offers | ✅ | FIFO claim-and-verify + recursive dual-layer TTL |
| QR generation + email delivery | ✅ | `qrcode` + Nodemailer, QR persisted independent of send success |

All six requirements are implemented and were exercised directly against a running instance
(local PostgreSQL + Redis, real HTTP requests) during development — not verified by code
inspection alone. See [system-design.md](system-design.md) for the underlying mechanism design
and [API.md](API.md) for the endpoint-level contract.
