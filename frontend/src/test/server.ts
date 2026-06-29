import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

// Default: logged out. Tests override per-case with `server.use(...)`.
export const handlers = [
  http.get("/api/auth/me", () => new HttpResponse(null, { status: 401 })),
];

export const server = setupServer(...handlers);
