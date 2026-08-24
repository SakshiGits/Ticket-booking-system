import QRCode from "qrcode";

/**
 * Generates a QR code (as a base64 data URL) encoding the booking reference.
 * The data URL is embedded directly in the confirmation email — no file storage needed.
 */
export async function generateBookingQr(bookingRef: string): Promise<string> {
  return QRCode.toDataURL(bookingRef, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 300,
  });
}
