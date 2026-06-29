import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { AuthProvider, useAuth } from "./AuthContext";

function Probe() {
  const { user, isLoading, login, logout } = useAuth();
  if (isLoading) return <p>loading</p>;
  return (
    <div>
      <p>user: {user ? user.username : "none"}</p>
      <button onClick={() => login({ username: "alice", password: "password123" })}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

function renderProbe() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

test("starts logged out when /me is 401", async () => {
  renderProbe();
  expect(await screen.findByText("user: none")).toBeInTheDocument();
});

test("login populates the user", async () => {
  renderProbe();
  await screen.findByText("user: none");
  server.use(
    http.post("/api/auth/login", () => HttpResponse.json({ id: "u1", username: "alice" })),
  );
  await userEvent.click(screen.getByText("login"));
  expect(await screen.findByText("user: alice")).toBeInTheDocument();
});

test("logout clears the user", async () => {
  server.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "u1", username: "alice" })));
  renderProbe();
  await screen.findByText("user: alice");
  server.use(http.post("/api/auth/logout", () => new HttpResponse(null, { status: 204 })));
  await userEvent.click(screen.getByText("logout"));
  await waitFor(() => expect(screen.getByText("user: none")).toBeInTheDocument());
});

test("logout purges other cached data and leaves the user logged out", async () => {
  server.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "u1", username: "alice" })));
  server.use(http.post("/api/auth/logout", () => new HttpResponse(null, { status: 204 })));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  qc.setQueryData(["recordings"], [{ id: "r1" }]);
  render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  await screen.findByText("user: alice");
  await userEvent.click(screen.getByText("logout"));
  await waitFor(() => expect(screen.getByText("user: none")).toBeInTheDocument());
  expect(qc.getQueryData(["recordings"])).toBeUndefined();
});
