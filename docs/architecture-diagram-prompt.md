# Architecture Diagram Prompt (for Eraser.io DiagramGPT)

Paste the block below into [Eraser DiagramGPT](https://app.eraser.io/) as-is. It's written as a
plain-language system description — components, grouping, and connections — which is the format
DiagramGPT parses best. Choose the **"Cloud architecture diagram"** or **"System design"** style
when prompted.

This describes the production topology (Render/Railway + Vercel). Local development mirrors it
exactly, just with Docker Compose standing in for the managed Postgres/Redis — see
[tech-stack.md](tech-stack.md) for the full technology rationale and
[requirements-compliance.md](requirements-compliance.md) for how each piece satisfies the brief.

---

```
Create a cloud architecture diagram for a ticket booking platform (movies and concerts).

CLIENT LAYER
- Web Browser: a React + TypeScript single-page app, deployed on Vercel. Used by three kinds of
  people: Customer, Organiser, and Admin.

APPLICATION LAYER (deployed on Render/Railway, as two separate services from the same codebase)
- API Server: Node.js + Express. Exposes REST endpoints grouped by resource — Auth, Venues,
  Events, Shows, Seats, Bookings, Waitlist, Reports. Also runs a Socket.IO gateway for real-time
  seat map updates.
- Worker Service: Node.js. Runs three BullMQ job consumers — Seat Hold Release, Waitlist Offer
  Expiry, Email Delivery — plus a periodic Reconciliation Sweep that runs on a timer independent
  of the job queue.

DATA LAYER
- PostgreSQL Database (managed): the source of truth. Stores Users, Venues, VenueSeats, Events,
  Shows, ShowCategories, ShowSeats, Bookings, and WaitlistEntries.
- Redis (managed): backs the BullMQ job queues (seat-hold-release, waitlist-offer-expiry,
  email-delivery) and Socket.IO's pub/sub layer.

EXTERNAL SERVICES
- SMTP Email Provider (e.g. Resend or Brevo): sends booking confirmation emails with an embedded
  QR code, and waitlist offer emails with a time-limited claim link.

CONNECTIONS
- Web Browser connects to API Server over HTTPS for REST calls.
- Web Browser connects to API Server over WebSocket (Socket.IO) to receive live "seat:update"
  events.
- API Server reads from and writes to PostgreSQL Database.
- API Server enqueues delayed jobs into Redis (on seat hold, booking cancellation, and waitlist
  offer creation).
- Worker Service consumes jobs from Redis.
- Worker Service reads from and writes to PostgreSQL Database (releasing expired holds,
  reassigning waitlist offers, marking bookings).
- Worker Service calls the SMTP Email Provider to send emails.
- API Server publishes real-time events back to Web Browser via Socket.IO whenever seat state
  changes (from a hold, a release, a booking, or a waitlist reassignment).

LAYOUT
Arrange top to bottom: Web Browser at the top, API Server and Worker Service side by side in the
middle as an "Application Layer" group, PostgreSQL and Redis side by side below them as a "Data
Layer" group, and the SMTP Email Provider off to the side as an "External Services" group
connected only to the Worker Service. Use distinct colors per layer (client, application, data,
external).
```

---

## If you want a second, more focused diagram

For a diagram that zooms into just the seat-hold/TTL/waitlist mechanics instead of full
infrastructure, use this shorter prompt instead:

```
Create a sequence diagram with four flows for a seat-booking system:

Flow 1 — Place a hold: Customer sends "hold seats" to API Server. API Server runs an atomic
conditional UPDATE against PostgreSQL (only if status=AVAILABLE). API Server schedules a delayed
job in Redis (BullMQ) with a TTL. API Server emits a "seat:update" event back to all subscribed
browsers via Socket.IO.

Flow 2 — Hold expires: Redis fires the delayed job into Worker Service after the TTL elapses.
Worker Service re-validates the hold is still expired in PostgreSQL, releases the seat, and emits
a "seat:update" event. A separate periodic Sweep in Worker Service also independently checks
PostgreSQL for missed expiries as a fallback.

Flow 3 — Checkout: Customer sends "checkout" to API Server. API Server re-validates the hold
atomically in a PostgreSQL transaction, creates a Booking, cancels the pending Redis job, and
enqueues an email job. Worker Service picks up the email job, generates a QR code, saves it to
the Booking, and sends an email via the SMTP Provider.

Flow 4 — Cancel and waitlist offer: Customer sends "cancel booking" to API Server. Inside one
PostgreSQL transaction, API Server marks the booking cancelled and atomically claims the next
WaitlistEntry for that seat's category, transitioning the seat to HELD for that waitlisted
customer. API Server schedules a new offer-expiry job in Redis and enqueues an offer email job,
which Worker Service sends via the SMTP Provider.
```
