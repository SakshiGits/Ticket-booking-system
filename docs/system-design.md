# System Design Write-Up

## 1. Seat Hold & TTL Mechanism

**Model**
- Each show snapshots its venue's seat layout into `ShowSeat` records carrying live state:
  `status` (`AVAILABLE` / `HELD` / `BOOKED`), `heldBy`, `holdExpiresAt`.
- Hold creation is a single conditional state transition, scoped only to rows currently
  `AVAILABLE` — atomic by construction, with no partial or ambiguous outcome.

**TTL enforcement — dual-layered, not a single point of failure**
- **Scheduler (primary):** a Redis-backed delayed job (BullMQ) fires at the TTL boundary and
  releases the seat — but only after re-validating `status='HELD'` and that `holdExpiresAt` has
  actually elapsed. That guard is what stops a stale job from an earlier hold invalidating a
  fresher hold placed on the same seat afterward.
- **Sweep (fallback):** an interval-driven reconciliation pass independently re-derives expired
  holds directly from Postgres, with no dependency on a job ever having existed — self-healing
  against dropped jobs, worker restarts, or queue outages.
- Manual "abandon checkout" release reuses the identical state-transition function: one code
  path, one source of truth, whether the seat is freed by timer or by the customer.

## 2. Concurrency Prevention

**No external locking layer required**
- Seat holds and checkout rely on the database's own transactional isolation, not a distributed
  lock, semaphore, or optimistic-retry scheme.
- A conditional `UPDATE` is inherently row-serializing: a request racing for an already-claimed
  seat sees the committed state before its own condition is evaluated, and simply matches zero
  rows.
- Rejection is deterministic and immediate — a direct consequence of isolation guarantees, not
  application-level coordination.

**Checkout closes the same race a second time**
- Rather than trusting a hold validated moments earlier, the booking transition re-verifies
  ownership, status, and non-expiry atomically at commit time, closing the window in which a hold
  could lapse mid-checkout.

**Verified, not assumed**
- Stress-tested directly during development: concurrent hold requests fired in parallel at an
  identical seat consistently resolved to exactly one winner and zero double-bookings, regardless
  of request timing or ordering.

## 3. Waitlist Auto-Assignment Flow

**Structure**
- Entries form an ordered, strictly FIFO queue, scoped per show *and* per seat category.
- Eligibility is enforced server-side, not just hidden in the UI: joining requires the category
  to be verifiably exhausted of `AVAILABLE` inventory, so the waitlist can't be used to bypass
  standard booking.

**Reassignment — atomic and race-safe**
- Triggered by cancellation and executed inside the *same* transaction that finalizes it: the
  freed seat and the queue are mutated together, so the seat is never observably `AVAILABLE` to
  the general public, even for an instant.
- Uses a claim-and-verify pattern mirroring the seat-hold mechanism: each candidate entry is
  atomically transitioned out of `WAITING`, and only a successful transition results in
  reassignment — so two seats freeing up concurrently in one category can never both be offered
  to the same customer.

## 4. Time-Limited Offer Handling

**A bounded window, not instant re-booking**
- A successful claim generates a single-use access token and an expiry timestamp, delivered by
  email — the seat sits `HELD` for the claimant rather than jumping straight to `BOOKED`.
- Deliberately mirrors the hold-TTL architecture: the identical dual-layer expiry model (delayed
  job + sweep) governs offer lifetimes — one design, reused, instead of two independent failure
  modes to reason about.

**Recursive, not terminal**
- An expired, unclaimed offer doesn't just release the seat — it re-enters the same claim
  routine against the *next* `WAITING` entry.
- This repeats — new token, new TTL, new email — until an offer is accepted or the queue empties,
  at which point the seat finally returns to general availability.
- Acceptance reuses the exact checkout transition, so offer-based and standard bookings carry
  identical correctness guarantees.

## Cross-Cutting: Operational Resilience

- State-changing operations are strictly decoupled from their downstream side effects. The
  database transaction is the sole source of truth; everything after it — job scheduling,
  realtime broadcast, email dispatch — executes best-effort, isolated from the critical path.
- This wasn't theoretical: a live test during development surfaced a real bug where a transient
  job-scheduling failure was turning an already-successful hold into a client-visible error.
  Fixing it enforced the principle system-wide — **correctness lives entirely in the
  transactional layer; infrastructure availability is a separate, independently-recoverable
  concern.**
- The same discipline extends to input validation and access control: every role-gated route
  (admin/organiser/customer) and every ownership check (a booking, a venue, an event) was
  verified directly, request by request, rather than assumed from the code alone.
