# API Reference

Base URL (local): `http://localhost:4000/api`
Base URL (production): `<your deployed API URL>/api`

All request and response bodies are `application/json`. All timestamps are ISO 8601 UTC strings.
All monetary amounts are decimal strings (e.g. `"450.00"`) except where noted as numbers in a
request body.

## Table of contents

0. [API design & code structure](#0-api-design--code-structure)
1. [Authentication](#1-authentication)
2. [Conventions](#2-conventions)
3. [Realtime events (Socket.IO)](#3-realtime-events-socketio)
4. [Auth](#4-auth)
5. [Venues](#5-venues)
6. [Events & Shows](#6-events--shows)
7. [Seats](#7-seats)
8. [Bookings](#8-bookings)
9. [Waitlist](#9-waitlist)
10. [Reports](#10-reports)

---

## 0. API design & code structure

The API is **resource-oriented REST**: one path segment per domain noun (`/venues`, `/events`,
`/shows`, `/bookings`, `/waitlist`, `/reports`), HTTP verbs carry the intent, and nested
sub-resources are expressed as sub-paths (`/events/:id/shows`, `/waitlist/offers/:token`) rather
than as query parameters or RPC-style action endpoints.

**Code structure mirrors the API surface.** Each resource is its own module under
`apps/api/src/modules/<name>/`, consistently split into:

- **`<name>.routes.ts`** — HTTP concerns only: path definitions, `authenticate`/`requireRole`
  guards, Zod request-schema validation, status codes. No business logic.
- **`<name>.service.ts`** — the actual domain logic (database transactions, state transitions,
  side-effect scheduling), fully independent of Express — directly unit-testable and reusable
  across routes (e.g. `bookings.service.ts`'s `bookHeldSeats` backs both ordinary checkout and
  waitlist-offer completion).

Cross-cutting concerns are centralized rather than repeated per route:

| Concern | Mechanism |
|---|---|
| Error handling | Every route body is wrapped in `asyncHandler`; a thrown `ApiError` or `ZodError` is caught once, centrally, and mapped to the right status code |
| Auth | `authenticate` (JWT verification) and `requireRole(...roles)` are composable Express middleware, applied per-route or per-router |
| Validation | Zod schemas parsed at the top of each handler — invalid input never reaches business logic |
| Realtime | A single `emitSeatUpdate` helper is the only thing that touches the Socket.IO server; services never talk to sockets directly |
| Background work | Services enqueue typed jobs via `jobs/queues.ts`; the worker process (`jobs/worker.ts`) is the only place that consumes them |

This keeps each module self-contained and the same shape, so navigating a new resource (e.g.
`reports`) is predictable once you've read any other one. See
[requirements-compliance.md](requirements-compliance.md) for how this structure maps to each
functional requirement, and [tech-stack.md](tech-stack.md) for why each underlying technology was
chosen.

---

## 1. Authentication

The API uses stateless JWT bearer authentication.

1. Obtain a token from `POST /auth/register` or `POST /auth/login`.
2. Send it on every subsequent request:

   ```
   Authorization: Bearer <token>
   ```

3. Tokens expire after `JWT_EXPIRES_IN` (default `7d`, configurable). There is no refresh-token
   flow — the client re-authenticates on expiry (a `401` response).

### Roles

| Role | Granted via | Capabilities |
|---|---|---|
| `CUSTOMER` | Public registration | Browse, hold/book seats, join waitlists, manage own bookings |
| `ORGANISER` | Public registration | Create events/shows/pricing, view own revenue reports |
| `ADMIN` | **Not self-registrable** — seeded or provisioned by an existing admin | Create/manage venues and seat layouts |

Public registration only accepts `role: "CUSTOMER" | "ORGANISER"`. Requesting `"ADMIN"` is
rejected with `400`.

---

## 2. Conventions

### Success responses

Returned directly as the resource (or array of resources) — there is no `{ data: ... }`
envelope. HTTP status communicates outcome:

| Status | Meaning |
|---|---|
| `200 OK` | Request succeeded (read, or a state change with a body) |
| `201 Created` | A new resource was created |
| `204 No Content` | Request succeeded, no body (e.g. deleting a seat layout) |

### Error responses

Every error is a JSON object with an `error` message. Validation failures additionally include a
`details` map of field-level messages:

```json
{ "error": "Invalid request", "details": { "role": ["Invalid enum value..."] } }
```

| Status | Meaning |
|---|---|
| `400 Bad Request` | Malformed input, or a request that fails a business rule (e.g. venue has no seat layout) |
| `401 Unauthorized` | Missing, malformed, or expired token |
| `403 Forbidden` | Authenticated, but the role or resource ownership doesn't permit this action |
| `404 Not Found` | Resource doesn't exist |
| `409 Conflict` | The request is well-formed but can't be satisfied right now — most notably, **a seat was no longer available when the hold/checkout was attempted** (the concurrency-safety response) |
| `500 Internal Server Error` | Unexpected server-side failure |

### Rate limiting

`120` requests/minute per IP by default (`express-rate-limit`), returned via standard
`X-RateLimit-*` response headers. This is a coarse abuse guard — it is **not** the mechanism that
prevents double-booking (see [System Design](system-design.md) §2 for that).

### Pagination

Not implemented. List endpoints (`GET /events`, `GET /bookings`, `GET /venues`) return the full
result set — acceptable at this project's scale; a real deployment would add cursor pagination.

---

## 3. Realtime events (Socket.IO)

Connect to the API's base URL (no `/api` suffix) over WebSocket:

```js
import { io } from "socket.io-client";
const socket = io("http://localhost:4000");
```

| Direction | Event | Payload | Purpose |
|---|---|---|---|
| Client → Server | `show:subscribe` | `showId: string` | Join the room for a show's seat map |
| Client → Server | `show:unsubscribe` | `showId: string` | Leave that room |
| Server → Client | `seat:update` | `{ showSeatId: string; status: "AVAILABLE" \| "HELD" \| "BOOKED" }[]` | One or more seats changed state — hold placed, hold released, booking confirmed, or waitlist reassignment |

Subscribe on entering a show's seat-map page and unsubscribe on leaving it. The event batches all
seats affected by one operation (e.g. a 3-seat hold arrives as one array of 3 updates).

---

## 4. Auth

### `POST /auth/register`

Creates a `CUSTOMER` or `ORGANISER` account and returns a session token.

**Auth:** none

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | min 2 characters |
| `email` | string | yes | must be unique |
| `password` | string | yes | min 8 characters |
| `role` | `"CUSTOMER" \| "ORGANISER"` | yes | `"ADMIN"` is rejected |

**Response `201`**

```json
{
  "token": "eyJhbGciOi...",
  "user": { "id": "uuid", "role": "CUSTOMER", "email": "jane@example.com" }
}
```

**Errors:** `409` email already registered · `400` validation failure

---

### `POST /auth/login`

**Auth:** none

**Request body:** `{ "email": string, "password": string }`

**Response `200`:** same shape as register.

**Errors:** `401` invalid email or password

---

## 5. Venues

Venues and their physical seat layouts are admin-managed. Organisers and customers get read-only
access via the `/public` routes to pick a venue when scheduling a show.

### `GET /venues/public`

Lists every venue (any authenticated role).

**Response `200`**

```json
[{ "id": "uuid", "name": "PVR Orion Mall", "address": "...", "_count": { "seats": 96 } }]
```

### `GET /venues/public/:id`

Venue detail with just its **distinct seat categories** (not the full seat list) — enough for an
organiser to price a show.

**Response `200`:** `{ "id", "name", "address", "categories": ["Premium", "Standard"] }`

**Errors:** `404`

---

### `POST /venues`

**Auth:** `ADMIN`

**Request body:** `{ "name": string (min 2), "address": string (min 2) }`

**Response `201`:** the created `Venue`.

### `GET /venues`

**Auth:** `ADMIN` — returns venues owned by the calling admin.

### `GET /venues/:id`

**Auth:** `ADMIN`. Returns the venue with its full seat list.

**Errors:** `404`

### `POST /venues/:id/seats`

Defines the physical seat layout as a list of rows. Can only be called once per venue (see
`DELETE` below to reset it).

**Auth:** `ADMIN`, must own the venue

**Request body**

```json
{
  "rows": [
    { "row": "A", "seatCount": 12, "category": "Premium" },
    { "row": "B", "seatCount": 12, "category": "Standard" }
  ]
}
```

**Response `201`:** the created `VenueSeat[]`.

**Errors:** `404` venue not found · `403` not your venue · `409` layout already exists

### `DELETE /venues/:id/seats`

Clears an unused layout so it can be redefined.

**Auth:** `ADMIN`, must own the venue

**Response:** `204 No Content`

**Errors:** `404` · `403` · `409` if any show already exists for this venue (deleting would break
that show's seat map)

---

## 6. Events & Shows

An **Event** is a movie or concert listing. A **Show** is one bookable date/time/venue instance
of that event, with its own per-category pricing and its own seat-map snapshot.

### `POST /events`

**Auth:** `ORGANISER`

**Request body**

| Field | Type | Required |
|---|---|---|
| `title` | string (min 2) | yes |
| `type` | `"MOVIE" \| "CONCERT"` | yes |
| `description` | string | no |
| `posterUrl` | string (URL) | no |
| `language` | string | no |
| `durationMinutes` | positive integer | no |
| `genre` | string | no |
| `rating` | number, 0–10 | no |

**Response `201`:** the created `Event`.

### `GET /events`

Public browse/filter — backs the customer home page.

**Auth:** none

**Query parameters** (all optional): `type` (`MOVIE`/`CONCERT`), `q` (title search),
`city` (matches venue address), `dateFrom`, `dateTo` (ISO date, filters by show date)

**Response `200`:** `Event[]`, each with its `shows[]` (id, date, time, venue summary).

### `GET /events/:id`

**Auth:** none

**Response `200`:** the `Event` with full `shows[]`, each including `venue` and `categories`.

**Errors:** `404`

### `POST /events/:id/shows`

Creates a show and snapshots the venue's current seat layout into per-show `ShowSeat` rows — this
is what the seat map and booking logic operate on from this point forward.

**Auth:** `ORGANISER`, must own the event

**Request body**

```json
{
  "venueId": "uuid",
  "date": "2026-09-01",
  "time": "19:30",
  "categories": [
    { "name": "Premium", "price": 450 },
    { "name": "Standard", "price": 250 }
  ]
}
```

Every category present in the venue's seat layout must have a price listed here.

**Response `201`:** the created `Show`.

**Errors:** `404` event not found · `403` not your event · `400` venue has no seat layout, or
pricing is missing for one or more categories present in the layout

---

## 7. Seats

### `GET /shows/:showId`

**Auth:** none. Show detail: `event`, `venue`, `categories`.

**Errors:** `404`

### `GET /shows/:showId/seatmap`

The live seat map — the primary read powering the visual grid.

**Auth:** none

**Response `200`**

```json
[
  {
    "id": "showSeatId",
    "row": "A",
    "number": 1,
    "posX": 0,
    "posY": 0,
    "category": "Premium",
    "price": "450.00",
    "status": "AVAILABLE",
    "holdExpiresAt": null
  }
]
```

### `POST /shows/:showId/hold`

Places a time-limited hold on one or more seats. **This is the concurrency-critical endpoint** —
see [System Design §2](system-design.md#2-concurrency-prevention).

**Auth:** `CUSTOMER`

**Request body:** `{ "seatIds": string[] }` — 1 to 10 UUIDs

**Response `200`:** `{ "seats": ShowSeat[], "expiresAt": "2026-09-01T19:00:00.000Z" }`

**Errors:** `409` — one or more requested seats are no longer `AVAILABLE` (lists the offending
seat IDs); this is the expected, correct response when two customers race for the same seat.

### `POST /shows/:showId/release`

Voluntarily abandons a hold before its TTL expires (e.g. customer navigates away).

**Auth:** `CUSTOMER`, must own the hold

**Request body:** `{ "seatIds": string[] }`

**Response `200`:** `{ "released": <count> }`

---

## 8. Bookings

### `POST /bookings/checkout`

Converts an active hold into a confirmed booking. Triggers QR generation and a confirmation email
asynchronously (see [System Design §1 & §4](system-design.md)).

**Auth:** `CUSTOMER`

**Request body:** `{ "showId": "uuid", "seatIds": string[] }` (1–10 UUIDs; must currently be held
by the caller)

**Response `201`:** the created `Booking`.

**Errors:** `409` — the hold on one or more seats expired or was never held by this customer
(re-select seats and try again) · `400` invalid seat selection

### `GET /bookings`

Booking history for the authenticated customer.

**Auth:** `CUSTOMER`

**Response `200`:** `Booking[]`, each with `show` (event + venue) and `seats[]`.

### `POST /bookings/:id/cancel`

Cancels a confirmed booking. If any freed seat's category has a waiting customer, that seat is
atomically reassigned to them instead of becoming generally available (see [System Design
§3](system-design.md#3-waitlist-auto-assignment-flow)).

**Auth:** `CUSTOMER`, must own the booking

**Response `200`:** the updated `Booking` (`status: "CANCELLED"`).

**Errors:** `404` · `403` not your booking · `409` already cancelled

---

## 9. Waitlist

### `POST /waitlist/:showId/join`

Joins the FIFO waitlist for one seat category on one show. Only permitted once that category has
zero `AVAILABLE` seats.

**Auth:** `CUSTOMER`

**Request body:** `{ "categoryId": "uuid" }`

**Response `201`:** the created `WaitlistEntry` (`status: "WAITING"`).

**Errors:** `400` seats are still available in that category · `409` already on this waitlist

### `GET /waitlist/offers/:token`

Reads an offer by its emailed token — public so the link works before the recipient logs in.

**Auth:** none

**Response `200`:** the `WaitlistEntry` with `show` (event + venue) and `category`.

**Errors:** `404`

### `POST /waitlist/offers/:token/complete`

Claims an active offer and books the held seat. Uses the same atomic hold→booking transition as
regular checkout.

**Auth:** `CUSTOMER`, must be the offer's recipient

**Response `201`:** the created `Booking`.

**Errors:** `403` this offer isn't yours · `409` offer no longer active, or has expired

---

## 10. Reports

### `GET /reports/events/:id/summary`

Bookings and revenue for an event, broken down per show.

**Auth:** `ORGANISER`, must own the event

**Response `200`**

```json
{
  "eventId": "uuid",
  "title": "Inception",
  "totalBookings": 42,
  "totalRevenue": 18900,
  "shows": [
    { "showId": "uuid", "date": "2026-09-01T00:00:00.000Z", "time": "19:30", "bookingsCount": 20, "seatsSold": 35, "revenue": 15750 }
  ]
}
```

Only `CONFIRMED` bookings are counted; cancelled bookings are excluded from both figures.

**Errors:** `404` event not found · `403` not your event

---

For the underlying data model, see [README.md § Database schema](../README.md#database-schema).
For how the seat-hold, concurrency, and waitlist mechanisms actually work end-to-end, see
[system-design.md](system-design.md).
