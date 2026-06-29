import { createContext, useContext, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../api/client";
import type { Credentials, UserOut } from "../api/types";

interface AuthValue {
  user: UserOut | null;
  isLoading: boolean;
  login: (c: Credentials) => Promise<UserOut>;
  register: (c: Credentials) => Promise<UserOut>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

async function fetchMe(): Promise<UserOut | null> {
  try {
    return await api.get<UserOut>("/api/auth/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: ["me"], queryFn: fetchMe });

  const loginMut = useMutation({
    mutationFn: (c: Credentials) => api.postJson<UserOut>("/api/auth/login", c),
    onSuccess: (user) => queryClient.setQueryData(["me"], user),
  });
  const registerMut = useMutation({
    mutationFn: (c: Credentials) => api.postJson<UserOut>("/api/auth/register", c),
    onSuccess: (user) => queryClient.setQueryData(["me"], user),
  });
  const logoutMut = useMutation({
    mutationFn: () => api.post<void>("/api/auth/logout"),
    onSuccess: () => {
      // Drop all per-user cached data, but never touch ["me"] — removing it
      // would trigger a /me refetch that races the logout. Then set the
      // logged-out sentinel directly.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      queryClient.setQueryData(["me"], null);
    },
  });

  const value: AuthValue = {
    user: meQuery.data ?? null,
    isLoading: meQuery.isLoading,
    login: (c) => loginMut.mutateAsync(c),
    register: (c) => registerMut.mutateAsync(c),
    logout: () => logoutMut.mutateAsync(),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
