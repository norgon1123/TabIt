import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { ApiError, api } from "./client";

test("get returns parsed json and sends credentials", async () => {
  let sentCredentials = false;
  server.use(
    http.get("/api/auth/me", ({ request }) => {
      sentCredentials = request.credentials === "include";
      return HttpResponse.json({ id: "u1", username: "alice" });
    }),
  );
  const user = await api.get<{ id: string; username: string }>("/api/auth/me");
  expect(user).toEqual({ id: "u1", username: "alice" });
  expect(sentCredentials).toBe(true);
});

test("non-ok response throws ApiError with status and detail", async () => {
  server.use(
    http.post("/api/auth/login", () =>
      HttpResponse.json({ detail: "Invalid credentials" }, { status: 401 }),
    ),
  );
  await expect(api.postJson("/api/auth/login", { username: "a", password: "b" })).rejects.toMatchObject(
    { status: 401, detail: "Invalid credentials" },
  );
});

test("204 responses resolve to undefined", async () => {
  server.use(http.delete("/api/recordings/r1", () => new HttpResponse(null, { status: 204 })));
  await expect(api.del("/api/recordings/r1")).resolves.toBeUndefined();
});

test("ApiError is an Error subclass", () => {
  const e = new ApiError(404, "nope");
  expect(e).toBeInstanceOf(Error);
  expect(e.status).toBe(404);
});
