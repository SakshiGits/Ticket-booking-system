import { v4 as uuidv4 } from "uuid";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db";
import { env } from "../../config/env";
import { ApiError } from "../../middleware/errors";
import { emitSeatUpdate } from "../../realtime/socket";
import { scheduleOfferExpiry, enqueueEmail } from "../../jobs/queues";
import { safeSideEffect } from "../../lib/safe";

type Tx = Prisma.TransactionClient;

export interface WaitlistOfferResult {
  entryId: string;
  customerId: string;
  offerToken: string;
  offerExpiresAt: Date;
}

/**
 * Tries to hand a freed seat to the next WAITING entry for its show+category, FIFO by
 * createdAt. Uses a claim-then-verify loop (atomic conditional updateMany per candidate) so
 * that if two seats free up concurrently for the same category, each can only ever claim one
 * waitlist entry — no two seats get offered to the same customer.
 * Must be called inside the same transaction that also mutates the seat/booking, so the offer
 * and the seat-state change commit or roll back together.
 */
export async function offerSeatToWaitlist(
  tx: Tx,
  showId: string,
  categoryId: string,
  seatId: string
): Promise<WaitlistOfferResult | null> {
  const candidates = await tx.waitlistEntry.findMany({
    where: { showId, categoryId, status: "WAITING" },
    orderBy: { createdAt: "asc" },
    take: 5,
  });

  const offerExpiresAt = new Date(Date.now() + env.WAITLIST_OFFER_TTL_MINUTES * 60 * 1000);

  for (const candidate of candidates) {
    const token = uuidv4();
    const claimed = await tx.waitlistEntry.updateMany({
      where: { id: candidate.id, status: "WAITING" },
      data: { status: "OFFERED", offeredSeatId: seatId, offerToken: token, offerExpiresAt },
    });
    if (claimed.count === 1) {
      await tx.showSeat.update({
        where: { id: seatId },
        data: { status: "HELD", heldBy: candidate.customerId, holdExpiresAt: offerExpiresAt, bookingId: null },
      });
      return { entryId: candidate.id, customerId: candidate.customerId, offerToken: token, offerExpiresAt };
    }
    // Another concurrent release already claimed this candidate — try the next one.
  }
  return null;
}

export async function joinWaitlist(showId: string, categoryId: string, userId: string) {
  const availableCount = await prisma.showSeat.count({ where: { showId, categoryId, status: "AVAILABLE" } });
  if (availableCount > 0) {
    throw new ApiError(400, "Seats are still available in this category — no need to join the waitlist");
  }

  const existing = await prisma.waitlistEntry.findFirst({
    where: { showId, categoryId, customerId: userId, status: { in: ["WAITING", "OFFERED"] } },
  });
  if (existing) throw new ApiError(409, "You are already on the waitlist for this category");

  return prisma.waitlistEntry.create({ data: { showId, categoryId, customerId: userId, status: "WAITING" } });
}

export async function getOfferByToken(token: string) {
  const entry = await prisma.waitlistEntry.findUnique({
    where: { offerToken: token },
    include: { show: { include: { event: true, venue: true } }, category: true },
  });
  if (!entry) throw new ApiError(404, "Offer not found");
  return entry;
}

/**
 * Fired when an offer's TTL elapses (BullMQ delayed job, or the sweep fallback). Marks the
 * entry EXPIRED and recurses: offers the same seat to the next WAITING entry, or releases it
 * to AVAILABLE if the waitlist is empty. Recursion naturally continues via the same job type
 * being rescheduled for the next candidate.
 */
export async function handleOfferExpiry(waitlistEntryId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const entry = await tx.waitlistEntry.findUnique({ where: { id: waitlistEntryId } });
    if (!entry || entry.status !== "OFFERED") return null; // already completed/handled
    if (entry.offerExpiresAt && entry.offerExpiresAt > new Date()) return null; // not actually due yet

    await tx.waitlistEntry.update({ where: { id: entry.id }, data: { status: "EXPIRED" } });

    const seatId = entry.offeredSeatId!;
    const nextOffer = await offerSeatToWaitlist(tx, entry.showId, entry.categoryId, seatId);
    if (!nextOffer) {
      await tx.showSeat.update({
        where: { id: seatId },
        data: { status: "AVAILABLE", heldBy: null, holdExpiresAt: null },
      });
    }
    return { showId: entry.showId, seatId, nextOffer };
  });

  if (!result) return;

  // The expiry + reassignment already committed above — the rest is best-effort.
  await safeSideEffect("emit-offer-expiry-outcome", async () =>
    emitSeatUpdate(result.showId, [{ showSeatId: result.seatId, status: result.nextOffer ? "HELD" : "AVAILABLE" }])
  );

  if (result.nextOffer) {
    await safeSideEffect("schedule-next-offer-expiry", () =>
      scheduleOfferExpiry(result.nextOffer!.entryId, result.nextOffer!.offerExpiresAt.getTime() - Date.now())
    );
    await safeSideEffect("enqueue-next-offer-email", () =>
      enqueueEmail({ type: "waitlist-offer", waitlistEntryId: result.nextOffer!.entryId })
    );
  }
}

/** Fallback sweep for offers whose expiry job was missed (e.g. worker downtime). */
export async function sweepExpiredOffers() {
  const expired = await prisma.waitlistEntry.findMany({
    where: { status: "OFFERED", offerExpiresAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const e of expired) {
    await handleOfferExpiry(e.id);
  }
  return expired.length;
}
