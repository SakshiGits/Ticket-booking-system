import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db";
import { asyncHandler } from "../../middleware/asyncHandler";
import { authenticate, requireRole } from "../../middleware/auth";
import { ApiError } from "../../middleware/errors";
import { getSeatMap, holdSeats, releaseSeats } from "./seats.service";

const router = Router();

const seatIdsSchema = z.object({ seatIds: z.array(z.string().uuid()).min(1).max(10) });

router.get(
  "/:showId",
  asyncHandler(async (req, res) => {
    const show = await prisma.show.findUnique({
      where: { id: req.params.showId },
      include: { event: true, venue: true, categories: true },
    });
    if (!show) throw new ApiError(404, "Show not found");
    res.json(show);
  })
);

router.get(
  "/:showId/seatmap",
  asyncHandler(async (req, res) => {
    const seats = await getSeatMap(req.params.showId);
    res.json(seats);
  })
);

router.post(
  "/:showId/hold",
  authenticate,
  requireRole("CUSTOMER"),
  asyncHandler(async (req, res) => {
    const { seatIds } = seatIdsSchema.parse(req.body);
    const result = await holdSeats(req.params.showId, req.user!.sub, seatIds);
    res.status(200).json(result);
  })
);

router.post(
  "/:showId/release",
  authenticate,
  requireRole("CUSTOMER"),
  asyncHandler(async (req, res) => {
    const { seatIds } = seatIdsSchema.parse(req.body);
    const count = await releaseSeats(req.params.showId, req.user!.sub, seatIds);
    res.json({ released: count });
  })
);

export default router;
