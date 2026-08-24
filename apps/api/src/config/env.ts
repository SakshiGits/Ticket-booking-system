import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CLIENT_URL: z.string().default("http://localhost:5173"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  JWT_SECRET: z.string().min(10, "JWT_SECRET must be set to a long random string"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  SEAT_HOLD_TTL_MINUTES: z.coerce.number().positive().default(10),
  WAITLIST_OFFER_TTL_MINUTES: z.coerce.number().positive().default(15),
  EXPIRY_SWEEP_INTERVAL_SECONDS: z.coerce.number().positive().default(30),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default("Ticket Booking <no-reply@ticketbooking.dev>"),
});

// Some hosting platforms (Railway included) inject an empty string for a variable that was
// never set, rather than omitting it entirely — which defeats Zod's `.default(...)`, since that
// only applies to `undefined`, not `""`. Normalize empty strings to undefined first so defaults
// still kick in regardless of how the platform represents "unset".
const rawEnv = Object.fromEntries(
  Object.entries(process.env).map(([key, value]) => [key, value === "" ? undefined : value])
);

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed — check .env against .env.example");
}

export const env = parsed.data;
