import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authenticate, requireRole } from "../../middleware/auth";
import { ApiError } from "../../middleware/errors";
import { joinWaitlist, getOfferByToken } from "./waitlist.service";
import { completeWaitlistBooking } from "../bookings/bookings.service";

const router = Router();

const joinSchema = z.object({ categoryId: z.string().uuid() });

router.post(
  "/:showId/join",
  authenticate,
  requireRole("CUSTOMER"),
  asyncHandler(async (req, res) => {
    const { categoryId } = joinSchema.parse(req.body);
    const entry = await joinWaitlist(req.params.showId, categoryId, req.user!.sub);
    res.status(201).json(entry);
  })
);

// Public read so the emailed link can render offer details before the user logs in.
router.get(
  "/offers/:token",
  asyncHandler(async (req, res) => {
    const entry = await getOfferByToken(req.params.token);
    res.json(entry);
  })
);

router.post(
  "/offers/:token/complete",
  authenticate,
  requireRole("CUSTOMER"),
  asyncHandler(async (req, res) => {
    const entry = await getOfferByToken(req.params.token);
    if (entry.customerId !== req.user!.sub) throw new ApiError(403, "This offer isn't yours");
    if (entry.status !== "OFFERED") throw new ApiError(409, "This offer is no longer active");
    if (!entry.offerExpiresAt || entry.offerExpiresAt <= new Date()) {
      throw new ApiError(409, "This offer has expired");
    }

    const booking = await completeWaitlistBooking(entry.showId, req.user!.sub, entry.offeredSeatId!, entry.id);
    res.status(201).json(booking);
  })
);

export default router;
