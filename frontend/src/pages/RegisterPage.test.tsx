import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import RegisterPage from "./RegisterPage";

function renderRegisterPage() {
  return renderWithProviders(<RegisterPage />);
}

test("submitting valid credentials calls the register endpoint", async () => {
  let body: unknown = null;
  server.use(
    http.post("/api/auth/register", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ id: "u1", username: "alice" });
    }),
  );
  renderRegisterPage();
  await userEvent.type(screen.getByLabelText(/username/i), "alice");
  await userEvent.type(screen.getByLabelText(/password/i), "password123");
  await userEvent.click(screen.getByRole("button", { name: /create account/i }));
  expect(body).toEqual({ username: "alice", password: "password123" });
});

test("shows a client-side error for a too-short password without hitting the server", async () => {
  let called = false;
  server.use(
    http.post("/api/auth/register", () => {
      called = true;
      return HttpResponse.json({ id: "u1", username: "alice" });
    }),
  );
  renderRegisterPage();
  await userEvent.type(screen.getByLabelText(/username/i), "alice");
  await userEvent.type(screen.getByLabelText(/password/i), "short1");
  await userEvent.click(screen.getByRole("button", { name: /create account/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/at least 8 characters/i);
  expect(called).toBe(false);
});

test("shows the error detail on a 409 from the server", async () => {
  server.use(
    http.post("/api/auth/register", () =>
      HttpResponse.json({ detail: "Username already taken" }, { status: 409 }),
    ),
  );
  renderRegisterPage();
  await userEvent.type(screen.getByLabelText(/username/i), "alice");
  await userEvent.type(screen.getByLabelText(/password/i), "password123");
  await userEvent.click(screen.getByRole("button", { name: /create account/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Username already taken");
});

test("submitting by pressing Enter in the password field registers", async () => {
  let called = false;
  server.use(
    http.post("/api/auth/register", () => {
      called = true;
      return HttpResponse.json({ id: "u1", username: "alice" });
    }),
  );
  renderRegisterPage();
  await userEvent.type(screen.getByLabelText(/username/i), "alice");
  await userEvent.type(screen.getByLabelText(/password/i), "password123{enter}");
  expect(called).toBe(true);
});

it("has no inline styles left", () => {
  const { container } = renderRegisterPage();
  expect(Array.from(container.querySelectorAll("[style]"))).toEqual([]);
});

it("labels every input", () => {
  renderRegisterPage();
  expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
});

it("submits with a real submit button", () => {
  // Button defaults to type=button. The register form's submit MUST opt in explicitly,
  // or pressing Enter in the password field does nothing.
  renderRegisterPage();
  expect(screen.getByRole("button", { name: /create account/i })).toHaveAttribute("type", "submit");
});
