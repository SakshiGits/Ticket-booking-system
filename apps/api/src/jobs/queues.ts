import { Queue } from "bullmq";
import { redisConnection } from "../config/redis";

// One queue per concern. Delayed jobs implement the TTL: we enqueue a job at hold/offer
// creation time with `delay` set to the TTL, instead of polling. A periodic sweep (see
// jobs/worker.ts) is the fallback for anything the scheduler missed (e.g. a worker restart).

export const holdReleaseQueue = new Queue("seat-hold-release", { connection: redisConnection });
export const offerExpiryQueue = new Queue("waitlist-offer-expiry", { connection: redisConnection });
export const emailQueue = new Queue("email-delivery", { connection: redisConnection });

// BullMQ custom job IDs may not contain ":" — use "-" as the separator.
export function holdReleaseJobId(showSeatId: string) {
  return `hold-release-${showSeatId}`;
}

export function offerExpiryJobId(waitlistEntryId: string) {
  return `offer-expiry-${waitlistEntryId}`;
}

export async function scheduleHoldRelease(showSeatId: string, delayMs: number) {
  await holdReleaseQueue.add(
    "release",
    { showSeatId },
    { jobId: holdReleaseJobId(showSeatId), delay: delayMs, removeOnComplete: true, removeOnFail: true }
  );
}

export async function cancelHoldRelease(showSeatId: string) {
  const job = await holdReleaseQueue.getJob(holdReleaseJobId(showSeatId));
  if (job) await job.remove();
}

export async function scheduleOfferExpiry(waitlistEntryId: string, delayMs: number) {
  await offerExpiryQueue.add(
    "expire",
    { waitlistEntryId },
    { jobId: offerExpiryJobId(waitlistEntryId), delay: delayMs, removeOnComplete: true, removeOnFail: true }
  );
}

export async function cancelOfferExpiry(waitlistEntryId: string) {
  const job = await offerExpiryQueue.getJob(offerExpiryJobId(waitlistEntryId));
  if (job) await job.remove();
}

export interface BookingEmailJob {
  type: "booking-confirmation";
  bookingId: string;
}
export interface WaitlistOfferEmailJob {
  type: "waitlist-offer";
  waitlistEntryId: string;
}

export async function enqueueEmail(payload: BookingEmailJob | WaitlistOfferEmailJob) {
  await emailQueue.add("send", payload, { removeOnComplete: true, attempts: 3, backoff: { type: "exponential", delay: 5000 } });
}
