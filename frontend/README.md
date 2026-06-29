# Tabit frontend

React + TypeScript SPA for Tabit. Talks to the FastAPI backend over its REST API
using cookie auth.

## Develop

    npm install
    npm run dev        # http://localhost:5173

The dev server proxies `/api` → `http://localhost:8000`, so run the backend too:

    # from the repo root
    uvicorn app.main:app --reload

Because the proxy makes the API same-origin, the httpOnly session cookie works in dev.

## Test

    npm test           # Vitest (jsdom) + Testing Library + MSW

## Build

    npm run build      # type-checks and emits static assets to dist/

## Production (single origin)

Serve the built `dist/` from the same origin as the API so the session cookie is
first-party. Two common options:

- Put a reverse proxy (Caddy/nginx) in front: serve `dist/` at `/` and proxy `/api`
  to the FastAPI service.
- Or mount the static build in FastAPI, e.g. in `app/main.py`:

      from fastapi.staticfiles import StaticFiles
      app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="spa")

  (Mount it AFTER the API routers so `/api/*` still resolves.) Set
  `TABIT_COOKIE_SECURE=true` when serving over HTTPS.
