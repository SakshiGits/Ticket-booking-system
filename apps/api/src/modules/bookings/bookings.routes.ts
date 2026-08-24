import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authenticate, requireRole } from "../../middleware/auth";
import { checkout, getMyBookings, cancelBooking } from "./bookings.service";

const router = Router();
router.use(authenticate, requireRole("CUSTOMER"));

const checkoutSchema = z.object({
  showId: z.string().uuid(),
  seatIds: z.array(z.string().uuid()).min(1).max(10),
});

router.post(
  "/checkout",
  asyncHandler(async (req, res) => {
    const body = checkoutSchema.parse(req.body);
    const booking = await checkout(body.showId, req.user!.sub, body.seatIds);
    res.status(201).json(booking);
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const bookings = await getMyBookings(req.user!.sub);
    res.json(bookings);
  })
);

router.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const booking = await cancelBooking(req.params.id, req.user!.sub);
    res.json(booking);
  })
);

export default router;
