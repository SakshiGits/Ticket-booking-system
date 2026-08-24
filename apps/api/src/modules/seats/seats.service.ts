import { prisma } from "../../config/db";
import { env } from "../../config/env";
import { ApiError } from "../../middleware/errors";
import { emitSeatUpdate } from "../../realtime/socket";
import { scheduleHoldRelease, cancelHoldRelease } from "../../jobs/queues";
import { safeSideEffect } from "../../lib/safe";

export async function getSeatMap(showId: string) {
  const seats = await prisma.showSeat.findMany({
    where: { showId },
    include: { venueSeat: true, category: true },
    orderBy: [{ venueSeat: { posY: "asc" } }, { venueSeat: { posX: "asc" } }],
  });

  return seats.map((s) => ({
    id: s.id,
    row: s.venueSeat.row,
    number: s.venueSeat.number,
    posX: s.venueSeat.posX,
    posY: s.venueSeat.posY,
    category: s.category.name,
    price: s.category.price,
    status: s.status,
    // holdExpiresAt only matters to the holder; still safe to expose for UI countdowns.
    holdExpiresAt: s.holdExpiresAt,
  }));
}

/**
 * Places a hold on the requested seats for `userId`. This is THE concurrency-critical path:
 * a single conditional `UPDATE ... WHERE status = 'AVAILABLE'` is atomic in Postgres — if two
 * requests race for the same seat, the second one's WHERE clause simply matches 0 rows after
 * the first commits, so it can never "win" a seat the first request already took.
 */
export async function holdSeats(showId: string, userId: string, seatIds: string[]) {
  if (seatIds.length === 0) throw new ApiError(400, "No seats specified");

  const ttlMs = env.SEAT_HOLD_TTL_MINUTES * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);

  const heldSeats = await prisma.$transaction(async (tx) => {
    const result = await tx.showSeat.updateMany({
      where: { id: { in: seatIds }, showId, status: "AVAILABLE" },
      data: { status: "HELD", heldBy: userId, holdExpiresAt: expiresAt },
    });

    if (result.count !== seatIds.length) {
      const current = await tx.showSeat.findMany({
        where: { id: { in: seatIds }, showId },
        select: { id: true, status: true },
      });
      const unavailable = current.filter((s) => s.status !== "AVAILABLE" || !seatIds.includes(s.id));
      throw new ApiError(
        409,
        `Some seats are no longer available: ${unavailable.map((s) => s.id).join(", ") || "unknown seat id"}`
      );
    }

    return tx.showSeat.findMany({
      where: { id: { in: seatIds } },
      include: { venueSeat: true, category: true },
    });
  });

  // The hold itself already committed above — everything from here is a best-effort optimization.
  await safeSideEffect("schedule-hold-release", () =>
    Promise.all(heldSeats.map((s) => scheduleHoldRelease(s.id, ttlMs)))
  );
  await safeSideEffect("emit-seat-held", async () =>
    emitSeatUpdate(
      showId,
      heldSeats.map((s) => ({ showSeatId: s.id, status: "HELD" as const }))
    )
  );

  return { seats: heldSeats, expiresAt };
}

/** Manual release — customer abandons checkout / deselects seats before the TTL fires. */
export async function releaseSeats(showId: string, userId: string, seatIds: string[]) {
  const result = await prisma.showSeat.updateMany({
    where: { id: { in: seatIds }, showId, status: "HELD", heldBy: userId },
    data: { status: "AVAILABLE", heldBy: null, holdExpiresAt: null },
  });

  await safeSideEffect("cancel-hold-release", () => Promise.all(seatIds.map((id) => cancelHoldRelease(id))));
  await safeSideEffect("emit-seat-available", async () =>
    emitSeatUpdate(
      showId,
      seatIds.map((id) => ({ showSeatId: id, status: "AVAILABLE" as const }))
    )
  );

  return result.count;
}

/**
 * Idempotent, race-safe expiry release. Called by the BullMQ delayed job and by the periodic
 * sweep. Guards on both status='HELD' and holdExpiresAt having actually passed, so a stale job
 * for an old hold can never clobber a fresh hold placed on the same seat afterwards.
 */
export async function releaseHoldIfExpired(showSeatId: string) {
  const seat = await prisma.showSeat.findUnique({ where: { id: showSeatId }, select: { showId: true } });
  if (!seat) return;

  const result = await prisma.showSeat.updateMany({
    where: { id: showSeatId, status: "HELD", holdExpiresAt: { lte: new Date() } },
    data: { status: "AVAILABLE", heldBy: null, holdExpiresAt: null },
  });

  if (result.count > 0) {
    emitSeatUpdate(seat.showId, [{ showSeatId, status: "AVAILABLE" }]);
  }
}

/** Fallback sweep — catches any expiry the scheduler missed (e.g. worker was down). */
export async function sweepExpiredHolds() {
  const expired = await prisma.showSeat.findMany({
    where: { status: "HELD", holdExpiresAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const s of expired) {
    await releaseHoldIfExpired(s.id);
  }
  return expired.length;
}
