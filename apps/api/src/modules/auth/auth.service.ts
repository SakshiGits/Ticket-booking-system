import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "../../config/db";
import { signToken } from "../../lib/jwt";
import { ApiError } from "../../middleware/errors";

// Public registration only ever creates customer or organiser accounts.
// Admin accounts are provisioned out-of-band (seed script / promoted by an existing admin) —
// the spec never lists admin self-registration as a requirement.
export async function registerUser(input: { name: string; email: string; password: string; role: "CUSTOMER" | "ORGANISER" }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ApiError(409, "An account with this email already exists");

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role as Role,
    },
  });

  return issueSession(user.id, user.role, user.email);
}

export async function loginUser(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new ApiError(401, "Invalid email or password");

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw new ApiError(401, "Invalid email or password");

  return issueSession(user.id, user.role, user.email);
}

function issueSession(userId: string, role: Role, email: string) {
  const token = signToken({ sub: userId, role, email });
  return { token, user: { id: userId, role, email } };
}
