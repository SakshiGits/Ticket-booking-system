import { prisma } from "../config/db";
import { env } from "../config/env";
import { generateBookingQr } from "../lib/qrcode";
import { sendMail, bookingConfirmationEmail, waitlistOfferEmail } from "../lib/mailer";

export async function sendBookingConfirmationEmail(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: true,
      show: { include: { event: true, venue: true } },
      seats: { include: { venueSeat: true } },
    },
  });
  if (!booking) return;

  const qrDataUrl = await generateBookingQr(booking.bookingRef);
  const qrBase64 = qrDataUrl.split(",")[1];
  const qrCid = "booking-qr";

  // Persist the QR before attempting delivery — a flaky SMTP provider must not leave the
  // ticket without its QR code. If sendMail below throws, BullMQ retries the job; this update
  // is idempotent so a retry just re-writes the same value.
  await prisma.booking.update({ where: { id: bookingId }, data: { qrUrl: qrDataUrl } });

  const html = bookingConfirmationEmail({
    customerName: booking.customer.name,
    eventTitle: booking.show.event.title,
    showDate: booking.show.date.toDateString(),
    showTime: booking.show.time,
    venueName: booking.show.venue.name,
    seatLabels: booking.seats.map((s) => `${s.venueSeat.row}${s.venueSeat.number}`),
    bookingRef: booking.bookingRef,
    totalAmount: `₹${Number(booking.totalAmount).toFixed(2)}`,
    qrCid,
  });

  await sendMail({
    to: booking.customer.email,
    subject: `Your ticket for ${booking.show.event.title} is confirmed`,
    html,
    attachments: [{ filename: "ticket-qr.png", content: qrBase64, encoding: "base64", cid: qrCid }],
  });
}

export async function sendWaitlistOfferEmail(waitlistEntryId: string) {
  const entry = await prisma.waitlistEntry.findUnique({
    where: { id: waitlistEntryId },
    include: { customer: true, show: { include: { event: true } } },
  });
  if (!entry || entry.status !== "OFFERED" || !entry.offerToken) return;

  const offerUrl = `${env.CLIENT_URL}/waitlist/offers/${entry.offerToken}`;
  const html = waitlistOfferEmail({
    customerName: entry.customer.name,
    eventTitle: entry.show.event.title,
    offerUrl,
    expiresInMinutes: env.WAITLIST_OFFER_TTL_MINUTES,
  });

  await sendMail({
    to: entry.customer.email,
    subject: `A seat is available for ${entry.show.event.title}`,
    html,
  });
}
