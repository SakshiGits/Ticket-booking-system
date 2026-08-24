import "../config/env";
import { Worker, Job } from "bullmq";
import { redisConnection } from "../config/redis";
import { env } from "../config/env";
import { releaseHoldIfExpired, sweepExpiredHolds } from "../modules/seats/seats.service";
import { handleOfferExpiry, sweepExpiredOffers } from "../modules/waitlist/waitlist.service";
import { sendBookingConfirmationEmail, sendWaitlistOfferEmail } from "./sendEmail.job";
import type { BookingEmailJob, WaitlistOfferEmailJob } from "./queues";

// --- Delayed-job workers: the primary TTL mechanism ---

const holdReleaseWorker = new Worker(
  "seat-hold-release",
  async (job: Job<{ showSeatId: string }>) => {
    await releaseHoldIfExpired(job.data.showSeatId);
  },
  { connection: redisConnection }
);

const offerExpiryWorker = new Worker(
  "waitlist-offer-expiry",
  async (job: Job<{ waitlistEntryId: string }>) => {
    await handleOfferExpiry(job.data.waitlistEntryId);
  },
  { connection: redisConnection }
);

const emailWorker = new Worker(
  "email-delivery",
  async (job: Job<BookingEmailJob | WaitlistOfferEmailJob>) => {
    if (job.data.type === "booking-confirmation") {
      await sendBookingConfirmationEmail(job.data.bookingId);
    } else {
      await sendWaitlistOfferEmail(job.data.waitlistEntryId);
    }
  },
  { connection: redisConnection }
);

// Failures here are exactly the case the fallback sweep exists for — log loudly rather than
// failing silently, since BullMQ otherwise just marks the job failed with nothing on stdout.
for (const [name, worker] of [
  ["seat-hold-release", holdReleaseWorker],
  ["waitlist-offer-expiry", offerExpiryWorker],
  ["email-delivery", emailWorker],
] as const) {
  worker.on("failed", (job, err) => {
    console.error(`[worker:${name}] job ${job?.id} failed:`, err.message);
  });
}

// --- Fallback sweep: catches anything the scheduler missed (e.g. worker was offline) ---

setInterval(async () => {
  try {
    const holds = await sweepExpiredHolds();
    const offers = await sweepExpiredOffers();
    if (holds > 0 || offers > 0) {
      console.log(`[sweep] released ${holds} expired hold(s), processed ${offers} expired offer(s)`);
    }
  } catch (err) {
    console.error("[sweep] error", err);
  }
}, env.EXPIRY_SWEEP_INTERVAL_SECONDS * 1000);

console.log("Worker process started — listening for hold-release, offer-expiry and email jobs.");
