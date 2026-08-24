import { PrismaClient } from "@prisma/client";

// Single shared Prisma client (connection pool) reused across the process.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
