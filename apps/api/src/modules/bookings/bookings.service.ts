import { prisma } from "../../config/db";
import { ApiError } from "../../middleware/errors";
import { emitSeatUpdate } from "../../realtime/socket";
import { cancelHoldRelease, cancelOfferExpiry, enqueueEmail, scheduleOfferExpiry } from "../../jobs/queues";
import { offerSeatToWaitlist } from "../waitlist/waitlist.service";
import { safeSideEffect } from "../../lib/safe";

/**
 * Shared core: converts seats currently HELD by `userId` into a confirmed booking.
 * The final `updateMany` re-checks status/owner/expiry atomically at write time — closing the
 * race window between reading the hold and committing the booking (e.g. TTL firing mid-checkout).
 */
async function bookHeldSeats(showId: string, userId: string, seatIds: string[]) {
  const booking = await prisma.$transaction(async (tx) => {
    const seats = await tx.showSeat.findMany({
      where: { id: { in: seatIds }, showId },
      include: { category: true },
    });
    if (seats.length !== seatIds.length) throw new ApiError(400, "Invalid seat selection");

    const notHeldByUser = seats.filter(
      (s) => s.status !== "HELD" || s.heldBy !== userId || !s.holdExpiresAt || s.holdExpiresAt <= new Date()
    );
    if (notHeldByUser.length > 0) {
      throw new ApiError(409, "Your hold on some seats has expired. Please reselect your seats.");
    }

    const totalAmount = seats.reduce((sum, s) => sum + Number(s.category.price), 0);
    const created = await tx.booking.create({
      data: { customerId: userId, showId, totalAmount, status: "CONFIRMED" },
    });

    const written = await tx.showSeat.updateMany({
      where: { id: { in: seatIds }, showId, status: "HELD", heldBy: userId, holdExpiresAt: { gt: new Date() } },
      data: { status: "BOOKED", heldBy: null, holdExpiresAt: null, bookingId: created.id },
    });
    if (written.count !== seatIds.length) {
      throw new ApiError(409, "Your hold on some seats expired during checkout. Please try again.");
    }

    return created;
  });

  // Booking already committed above — everything below is best-effort (see safeSideEffect).
  await safeSideEffect("emit-seat-booked", async () =>
    emitSeatUpdate(
      showId,
      seatIds.map((id) => ({ showSeatId: id, status: "BOOKED" as const }))
    )
  );
  await safeSideEffect("enqueue-confirmation-email", () =>
    enqueueEmail({ type: "booking-confirmation", bookingId: booking.id })
  );

  return booking;
}

/** Normal checkout path: customer completes booking on their own active hold. */
export async function checkout(showId: string, userId: string, seatIds: string[]) {
  const booking = await bookHeldSeats(showId, userId, seatIds);
  await safeSideEffect("cancel-hold-release-on-checkout", () =>
    Promise.all(seatIds.map((id) => cancelHoldRelease(id)))
  );
  return booking;
}

/** Waitlist-offer completion path: the held seat came from an accepted waitlist offer. */
export async function completeWaitlistBooking(showId: string, userId: string, seatId: string, waitlistEntryId: string) {
  const booking = await bookHeldSeats(showId, userId, [seatId]);
  await safeSideEffect("cancel-offer-expiry-on-complete", () => cancelOfferExpiry(waitlistEntryId));
  await prisma.waitlistEntry.update({ where: { id: waitlistEntryId }, data: { status: "BOOKED" } });
  return booking;
}

export async function getMyBookings(userId: string) {
  return prisma.booking.findMany({
    where: { customerId: userId },
    include: {
      show: { include: { event: true, venue: true } },
      seats: { include: { venueSeat: true, category: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Cancels a booking and, per seat, either hands it straight to the next waitlisted customer
 * (atomically, in the same transaction) or releases it to AVAILABLE if nobody is waiting.
 * The seat never observably sits at AVAILABLE when a waitlist offer is about to claim it —
 * avoiding a window where an ordinary browsing customer could grab it first.
 */
export async function cancelBooking(bookingId: string, userId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { seats: true } });
  if (!booking) throw new ApiError(404, "Booking not found");
  if (booking.customerId !== userId) throw new ApiError(403, "Not your booking");
  if (booking.status === "CANCELLED") throw new ApiError(409, "Booking already cancelled");

  type Outcome = {
    seatId: string;
    status: "AVAILABLE" | "HELD";
    waitlistOffer?: { entryId: string; offerExpiresAt: Date };
  };
  const outcomes: Outcome[] = [];

  const cancelled = await prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED", cancelledAt: new Date() } });

    for (const seat of booking.seats) {
      const offer = await offerSeatToWaitlist(tx, booking.showId, seat.categoryId, seat.id);
      if (offer) {
        outcomes.push({ seatId: seat.id, status: "HELD", waitlistOffer: { entryId: offer.entryId, offerExpiresAt: offer.offerExpiresAt } });
      } else {
        await tx.showSeat.update({
          where: { id: seat.id },
          data: { status: "AVAILABLE", heldBy: null, holdExpiresAt: null, bookingId: null },
        });
        outcomes.push({ seatId: seat.id, status: "AVAILABLE" });
      }
    }

    return updated;
  });

  // Cancellation + waitlist re-assignment already committed above — the rest is best-effort.
  await safeSideEffect("emit-cancel-outcomes", async () =>
    emitSeatUpdate(
      booking.showId,
      outcomes.map((o) => ({ showSeatId: o.seatId, status: o.status }))
    )
  );

  for (const o of outcomes) {
    if (o.waitlistOffer) {
      await safeSideEffect("schedule-offer-expiry", () =>
        scheduleOfferExpiry(o.waitlistOffer!.entryId, o.waitlistOffer!.offerExpiresAt.getTime() - Date.now())
      );
      await safeSideEffect("enqueue-offer-email", () =>
        enqueueEmail({ type: "waitlist-offer", waitlistEntryId: o.waitlistOffer!.entryId })
      );
    }
  }

  return cancelled;
}
