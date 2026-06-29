import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import LoginPage from "./LoginPage";

test("submitting valid credentials calls the login endpoint", async () => {
  let body: unknown = null;
  server.use(
    http.post("/api/auth/login", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ id: "u1", username: "alice" });
    }),
  );
  renderWithProviders(<LoginPage />);
  await userEvent.type(screen.getByLabelText(/username/i), "alice");
  await userEvent.type(screen.getByLabelText(/password/i), "password123");
  await userEvent.click(screen.getByRole("button", { name: /log in/i }));
  expect(body).toEqual({ username: "alice", password: "password123" });
});

test("shows the error detail on 401", async () => {
  server.use(
    http.post("/api/auth/login", () =>
      HttpResponse.json({ detail: "Invalid credentials" }, { status: 401 }),
    ),
  );
  renderWithProviders(<LoginPage />);
  await userEvent.type(screen.getByLabelText(/username/i), "alice");
  await userEvent.type(screen.getByLabelText(/password/i), "wrongpass1");
  await userEvent.click(screen.getByRole("button", { name: /log in/i }));
  expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
});
