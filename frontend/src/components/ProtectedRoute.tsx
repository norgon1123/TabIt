import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p className="muted container">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
