import { Router } from "express";
import { prisma } from "../../config/db";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authenticate, requireRole } from "../../middleware/auth";
import { ApiError } from "../../middleware/errors";

const router = Router();
router.use(authenticate, requireRole("ORGANISER"));

router.get(
  "/events/:id/summary",
  asyncHandler(async (req, res) => {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: { shows: true },
    });
    if (!event) throw new ApiError(404, "Event not found");
    if (event.organiserId !== req.user!.sub) throw new ApiError(403, "Not your event");

    const showIds = event.shows.map((s) => s.id);
    const bookings = await prisma.booking.findMany({
      where: { showId: { in: showIds }, status: "CONFIRMED" },
      include: { seats: true },
    });

    const perShow = event.shows.map((show) => {
      const showBookings = bookings.filter((b) => b.showId === show.id);
      return {
        showId: show.id,
        date: show.date,
        time: show.time,
        bookingsCount: showBookings.length,
        seatsSold: showBookings.reduce((sum, b) => sum + b.seats.length, 0),
        revenue: showBookings.reduce((sum, b) => sum + Number(b.totalAmount), 0),
      };
    });

    res.json({
      eventId: event.id,
      title: event.title,
      totalBookings: bookings.length,
      totalRevenue: perShow.reduce((sum, s) => sum + s.revenue, 0),
      shows: perShow,
    });
  })
);

export default router;
