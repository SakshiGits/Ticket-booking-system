import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { notFound, errorHandler } from "./middleware/errors";

import authRoutes from "./modules/auth/auth.routes";
import venueRoutes from "./modules/venues/venues.routes";
import eventRoutes from "./modules/events/events.routes";
import showRoutes from "./modules/seats/seats.routes";
import bookingRoutes from "./modules/bookings/bookings.routes";
import waitlistRoutes from "./modules/waitlist/waitlist.routes";
import reportRoutes from "./modules/reports/reports.routes";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, limit: 120 })); // generous default; hold/booking races are handled at the DB layer, not by rate limiting

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/venues", venueRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/shows", showRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/waitlist", waitlistRoutes);
app.use("/api/reports", reportRoutes);

app.use(notFound);
app.use(errorHandler);
