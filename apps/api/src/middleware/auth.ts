import { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { verifyToken, JwtPayload } from "../lib/jwt";
import { ApiError } from "./errors";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new ApiError(401, "Missing or invalid Authorization header");
  }
  try {
    req.user = verifyToken(header.slice("Bearer ".length));
    next();
  } catch {
    throw new ApiError(401, "Invalid or expired token");
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new ApiError(401, "Not authenticated");
    if (!roles.includes(req.user.role)) {
      throw new ApiError(403, "You do not have permission to perform this action");
    }
    next();
  };
}
