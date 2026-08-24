import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});

interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string; encoding?: string; cid?: string }[];
}

export async function sendMail(input: SendMailInput): Promise<void> {
  if (!env.SMTP_HOST) {
    // Local/dev fallback so the flow doesn't crash if SMTP isn't configured yet.
    console.log(`[mailer] SMTP not configured — skipping send to ${input.to}: ${input.subject}`);
    return;
  }
  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments,
  });
}

export function bookingConfirmationEmail(params: {
  customerName: string;
  eventTitle: string;
  showDate: string;
  showTime: string;
  venueName: string;
  seatLabels: string[];
  bookingRef: string;
  totalAmount: string;
  qrCid: string;
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Booking Confirmed 🎟️</h2>
      <p>Hi ${params.customerName}, your booking for <strong>${params.eventTitle}</strong> is confirmed.</p>
      <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td><strong>Venue</strong></td><td>${params.venueName}</td></tr>
        <tr><td><strong>Date</strong></td><td>${params.showDate} ${params.showTime}</td></tr>
        <tr><td><strong>Seats</strong></td><td>${params.seatLabels.join(", ")}</td></tr>
        <tr><td><strong>Total</strong></td><td>${params.totalAmount}</td></tr>
        <tr><td><strong>Booking Ref</strong></td><td>${params.bookingRef}</td></tr>
      </table>
      <p>Show this QR code at the venue entrance:</p>
      <img src="cid:${params.qrCid}" alt="Booking QR code" width="220" height="220" />
    </div>
  `;
}

export function waitlistOfferEmail(params: {
  customerName: string;
  eventTitle: string;
  offerUrl: string;
  expiresInMinutes: number;
}): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>A seat opened up 🎉</h2>
      <p>Hi ${params.customerName}, a seat for <strong>${params.eventTitle}</strong> is now available for you from the waitlist.</p>
      <p><a href="${params.offerUrl}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;">Claim your seat</a></p>
      <p>This offer expires in ${params.expiresInMinutes} minutes. If it lapses, the seat moves to the next person on the waitlist.</p>
    </div>
  `;
}
