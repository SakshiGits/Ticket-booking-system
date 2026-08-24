import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authenticate, requireRole } from "../../middleware/auth";
import { ApiError } from "../../middleware/errors";

const router = Router();

const createEventSchema = z.object({
  title: z.string().min(2),
  type: z.enum(["MOVIE", "CONCERT"]),
  description: z.string().optional(),
  posterUrl: z.string().url().optional(),
  language: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
  genre: z.string().optional(),
  rating: z.number().min(0).max(10).optional(),
});

const createShowSchema = z.object({
  venueId: z.string().uuid(),
  date: z.coerce.date(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:mm"),
  categories: z.array(z.object({ name: z.string().min(1), price: z.number().positive() })).min(1),
});

// --- Organiser: create event ---
router.post(
  "/",
  authenticate,
  requireRole("ORGANISER"),
  asyncHandler(async (req, res) => {
    const body = createEventSchema.parse(req.body);
    const event = await prisma.event.create({
      data: { ...body, organiserId: req.user!.sub },
    });
    res.status(201).json(event);
  })
);

// --- Public: browse + filter events ---
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { type, city, q, dateFrom, dateTo } = req.query as Record<string, string | undefined>;

    const events = await prisma.event.findMany({
      where: {
        type: type ? (type.toUpperCase() as "MOVIE" | "CONCERT") : undefined,
        title: q ? { contains: q, mode: "insensitive" } : undefined,
        shows: {
          some: {
            date: {
              gte: dateFrom ? new Date(dateFrom) : undefined,
              lte: dateTo ? new Date(dateTo) : undefined,
            },
            venue: city ? { address: { contains: city, mode: "insensitive" } } : undefined,
          },
        },
      },
      include: {
        shows: { select: { id: true, date: true, time: true, venue: { select: { id: true, name: true, address: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(events);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        shows: {
          include: { venue: true, categories: true },
          orderBy: { date: "asc" },
        },
      },
    });
    if (!event) throw new ApiError(404, "Event not found");
    res.json(event);
  })
);

// --- Organiser: create a show (date/time/venue) with per-category pricing ---
router.post(
  "/:id/shows",
  authenticate,
  requireRole("ORGANISER"),
  asyncHandler(async (req, res) => {
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) throw new ApiError(404, "Event not found");
    if (event.organiserId !== req.user!.sub) throw new ApiError(403, "Not your event");

    const body = createShowSchema.parse(req.body);

    const venueSeats = await prisma.venueSeat.findMany({ where: { venueId: body.venueId } });
    if (venueSeats.length === 0) throw new ApiError(400, "Venue has no seat layout defined yet");

    const venueCategories = new Set(venueSeats.map((s) => s.category));
    const priced = new Set(body.categories.map((c) => c.name));
    const missing = [...venueCategories].filter((c) => !priced.has(c));
    if (missing.length > 0) {
      throw new ApiError(400, `Missing pricing for categories: ${missing.join(", ")}`);
    }

    const show = await prisma.$transaction(async (tx) => {
      const created = await tx.show.create({
        data: { eventId: event.id, venueId: body.venueId, date: body.date, time: body.time },
      });

      const categoryRecords = await Promise.all(
        body.categories.map((c) =>
          tx.showCategory.create({ data: { showId: created.id, name: c.name, price: c.price } })
        )
      );
      const categoryIdByName = new Map(categoryRecords.map((c) => [c.name, c.id]));

      // Snapshot every physical seat into this show with AVAILABLE status — this snapshot
      // is what the seat map and hold/booking logic operate on.
      await tx.showSeat.createMany({
        data: venueSeats.map((vs) => ({
          showId: created.id,
          venueSeatId: vs.id,
          categoryId: categoryIdByName.get(vs.category)!,
        })),
      });

      return created;
    });

    res.status(201).json(show);
  })
);

export default router;
