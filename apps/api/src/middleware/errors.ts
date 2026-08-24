import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const notFound = (req: Request, res: Response) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
};

// Centralized error handler — every route uses asyncHandler + throws ApiError for expected
// failures. Zod validation failures (e.g. a role outside the public-registration enum, a
// malformed body) are also expected client errors and must surface as 400, not a generic 500.
export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Invalid request", details: err.flatten().fieldErrors });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
