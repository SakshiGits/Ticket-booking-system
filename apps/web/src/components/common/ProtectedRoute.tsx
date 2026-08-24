import { Navigate } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth } from "../../context/AuthContext";
import { Role } from "../../types";

export function ProtectedRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
