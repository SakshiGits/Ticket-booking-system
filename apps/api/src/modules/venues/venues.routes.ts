import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authenticate, requireRole } from "../../middleware/auth";
import { ApiError } from "../../middleware/errors";

const router = Router();

// Public: venue names/addresses aren't sensitive, and anonymous visitors need them too (e.g. to
// populate a location filter before logging in) — organisers use the same list when picking a
// venue for a show.
router.get(
  "/public",
  asyncHandler(async (_req, res) => {
    const venues = await prisma.venue.findMany({
      select: { id: true, name: true, address: true, _count: { select: { seats: true } } },
      orderBy: { name: "asc" },
    });
    res.json(venues);
  })
);

// Public venue detail (distinct categories only) — lets an organiser see what to price
// without needing admin rights to read the full seat layout.
router.get(
  "/public/:id",
  authenticate,
  asyncHandler(async (req, res) => {
    const venue = await prisma.venue.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, address: true, seats: { select: { category: true } } },
    });
    if (!venue) throw new ApiError(404, "Venue not found");
    res.json({
      id: venue.id,
      name: venue.name,
      address: venue.address,
      categories: [...new Set(venue.seats.map((s) => s.category))],
    });
  })
);

router.use(authenticate, requireRole("ADMIN"));

const createVenueSchema = z.object({
  name: z.string().min(2),
  address: z.string().min(2),
});

// Bulk seat-layout creation: rows x seatsPerRow grid, with a category assigned per row range.
const seatLayoutSchema = z.object({
  rows: z.array(
    z.object({
      row: z.string().min(1), // e.g. "A"
      seatCount: z.number().int().positive(),
      category: z.string().min(1), // e.g. "Premium" | "Standard"
    })
  ),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createVenueSchema.parse(req.body);
    const venue = await prisma.venue.create({
      data: { ...body, adminId: req.user!.sub },
    });
    res.status(201).json(venue);
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const venues = await prisma.venue.findMany({
      where: { adminId: req.user!.sub },
      include: { _count: { select: { seats: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(venues);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const venue = await prisma.venue.findUnique({
      where: { id: req.params.id },
      include: { seats: { orderBy: [{ row: "asc" }, { number: "asc" }] } },
    });
    if (!venue) throw new ApiError(404, "Venue not found");
    res.json(venue);
  })
);

// Defines (or replaces) the physical seat layout for a venue. Reused by every show at that venue.
router.post(
  "/:id/seats",
  asyncHandler(async (req, res) => {
    const venue = await prisma.venue.findUnique({ where: { id: req.params.id } });
    if (!venue) throw new ApiError(404, "Venue not found");
    if (venue.adminId !== req.user!.sub) throw new ApiError(403, "Not your venue");

    const body = seatLayoutSchema.parse(req.body);
    const existingSeatCount = await prisma.venueSeat.count({ where: { venueId: venue.id } });
    if (existingSeatCount > 0) {
      throw new ApiError(409, "Seat layout already exists for this venue. Delete it before redefining.");
    }

    const seatData = body.rows.flatMap((r, rowIdx) =>
      Array.from({ length: r.seatCount }, (_, i) => ({
        venueId: venue.id,
        row: r.row,
        number: i + 1,
        category: r.category,
        posX: i,
        posY: rowIdx,
      }))
    );

    await prisma.venueSeat.createMany({ data: seatData });
    const seats = await prisma.venueSeat.findMany({ where: { venueId: venue.id } });
    res.status(201).json(seats);
  })
);

// Deletes an unused seat layout so it can be redefined. Blocked once any show has snapshotted
// these seats (deleting would silently break existing shows' seat maps).
router.delete(
  "/:id/seats",
  asyncHandler(async (req, res) => {
    const venue = await prisma.venue.findUnique({ where: { id: req.params.id } });
    if (!venue) throw new ApiError(404, "Venue not found");
    if (venue.adminId !== req.user!.sub) throw new ApiError(403, "Not your venue");

    const showCount = await prisma.show.count({ where: { venueId: venue.id } });
    if (showCount > 0) {
      throw new ApiError(409, "Cannot redefine layout: shows already exist for this venue");
    }

    await prisma.venueSeat.deleteMany({ where: { venueId: venue.id } });
    res.status(204).send();
  })
);

export default router;
