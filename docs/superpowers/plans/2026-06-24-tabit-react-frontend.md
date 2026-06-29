# Tabit React Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A React SPA where a signed-in user uploads practice recordings, watches analysis status, and views/edits the resulting chord chart (audio playback, timeline, inline chord edits, segment-boundary edits, live transpose).

**Architecture:** Vite + React + TypeScript SPA in `frontend/`, talking to the existing FastAPI backend over its REST API using cookie auth (`credentials: "include"`). TanStack Query owns all server state (caching, polling, invalidation); React Router owns navigation; a typed `fetch` client wraps the API. The **backend is the single source of truth for music theory** — the SPA renders roman numerals and transposed chords returned by the API and never recomputes them locally. One small backend addition (an audio-streaming endpoint) precedes the frontend work.

**Tech Stack:** Vite 5, React 18, TypeScript 5 (strict), React Router 6, TanStack Query 5, Vitest 2 + React Testing Library 16 + user-event 14 + MSW 2 (jsdom). Backend additions in Python/FastAPI tested with pytest.

## Global Constraints

- **No git / no commits.** This project runs without version control. Each task ends by running its test suite, not by committing. Do **not** run `git` commands.
- **Backend owns music theory.** The SPA must render `roman_numeral`, `key_tonic`, and transposed `chord_root` values exactly as returned by the API. Never compute roman numerals or transposition client-side.
- **Cookie auth.** The session cookie is httpOnly (not readable in JS). Every API call uses `credentials: "include"`. Auth state derives solely from `GET /api/auth/me` (200 → user, 401 → logged out).
- **Per-user scoping is server-side.** The SPA treats `404` as "not found / not yours" — no special `403` handling, no attempt to distinguish ownership.
- **v1 chord vocabulary, verbatim from the backend:** chord roots match `^[A-G][b#]?$`; chord qualities are exactly `maj | min | dom7 | maj7 | min7`; transpose `semitones` is an integer in `[-11, 11]`. Editor selectors must offer exactly these.
- **Analysis status vocabulary:** `pending | running | done | failed` (poll `GET /api/recordings/{id}/analysis` or read `recording.analysis.status`).
- **Dev origin model:** Vite dev server proxies `/api` → `http://localhost:8000` so the cookie is same-origin in dev. Production serves the built SPA same-origin as the API (documented in Task 10).
- **TypeScript strict mode on.** Mobile-friendly, responsive layout (the user uploads from a phone after practice).
- **Frontend commands run from `/Users/neilorgon/projects/tabit/frontend`** using `npm`. Backend commands run from the repo root using `.venv/bin/pytest`.

---

## Backend API reference (already implemented — consume, do not change except Task 1)

- `POST /api/auth/register` `{username,password}` → 201 `UserOut{id,username}` + sets cookie; 409 if taken.
- `POST /api/auth/login` `{username,password}` → 200 `UserOut` + sets cookie; 401 invalid.
- `POST /api/auth/logout` → 204 (revokes current session, clears cookie).
- `GET /api/auth/me` → 200 `UserOut`; 401 if no/invalid session.
- `GET /api/recordings` → 200 `RecordingOut[]` (newest first).
- `POST /api/recordings` multipart `{file, duration_seconds?}` → 201 `RecordingOut`.
- `GET /api/recordings/{id}` → 200 `RecordingOut`; 404.
- `GET /api/recordings/{id}/analysis` → 200 `AnalysisOut`; 404.
- `POST /api/recordings/{id}/analyze` → 202 `AnalysisOut` (re-run).
- `DELETE /api/recordings/{id}` → 204.
- `GET /api/recordings/{id}/audio` → 200 audio bytes (**added in Task 1**); 404.
- `GET /api/recordings/{id}/chart` → 200 `ChartOut`; 404 (until analysis seeds it).
- `POST /api/recordings/{id}/chart` `{key_tonic,key_mode}` → 201 `ChartOut`; 409 if exists.
- `POST /api/charts/{chartId}/segments` `{start_time,end_time,chord_root,chord_quality}` → 201 `SegmentOut`.
- `PATCH /api/charts/{chartId}/segments/{segmentId}` `{start_time?,end_time?,chord_root?,chord_quality?}` → 200 `SegmentOut`; 422 on invalid window.
- `DELETE /api/charts/{chartId}/segments/{segmentId}` → 204.
- `POST /api/charts/{chartId}/transpose` `{semitones}` → 200 `ChartOut`.

Shapes: `RecordingOut{id,original_filename,format,duration_seconds:number|null,status,analysis:AnalysisOut|null}`; `AnalysisOut{status,bpm:number|null,detected_key_tonic:string|null,detected_key_mode:string|null,engine_version:string|null,error:string|null}`; `ChartOut{id,recording_id,key_tonic,key_mode,segments:SegmentOut[]}`; `SegmentOut{id,start_time,end_time,chord_root,chord_quality,roman_numeral}`.

---

## File Structure

**Backend (Task 1):** modify `app/routers/recordings.py`, `tests/test_recordings.py`.

**Frontend (`frontend/`):**
- `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `.gitignore`
- `src/main.tsx` — root render: QueryClientProvider → BrowserRouter → AuthProvider → App
- `src/App.tsx` — route table + Header
- `src/index.css` — base/responsive styles
- `src/test/setup.ts`, `src/test/server.ts`, `src/test/utils.tsx` — Vitest + MSW + render helper
- `src/api/types.ts` — TS mirrors of API shapes
- `src/api/client.ts` — `api` fetch wrapper + `ApiError`
- `src/api/music.ts` — `ROOTS`, `QUALITIES`, `QUALITY_LABELS`
- `src/auth/AuthContext.tsx` — `AuthProvider`, `useAuth`
- `src/components/ProtectedRoute.tsx`, `src/components/Header.tsx`, `src/components/AnalysisStatusBadge.tsx`
- `src/pages/LoginPage.tsx`, `src/pages/RegisterPage.tsx`, `src/pages/LibraryPage.tsx`, `src/pages/ChartEditorPage.tsx`
- `src/library/useRecordings.ts`, `src/library/audioDuration.ts`, `src/library/UploadButton.tsx`
- `src/chart/useChart.ts`, `src/chart/timeMath.ts`, `src/chart/Timeline.tsx`, `src/chart/SegmentEditor.tsx`, `src/chart/TransposeControl.tsx`
- `frontend/README.md`

---

### Task 1: Backend audio-streaming endpoint

The SPA's `<audio>` element needs to fetch the stored file. Add an owner-scoped streaming endpoint. Starlette's `FileResponse` already supports HTTP Range requests (needed for seeking).

**Files:**
- Modify: `app/routers/recordings.py`
- Test: `tests/test_recordings.py` (append)

**Interfaces:**
- Produces: `GET /api/recordings/{recording_id}/audio` → 200 with the file bytes and an audio `Content-Type`; 404 for non-owner or missing file.

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_recordings.py`:

```python
def test_download_audio_returns_file(client, tmp_path, monkeypatch, fake_dispatcher):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client)
    rec_id = _upload(client, "memo.m4a").json()["id"]

    resp = client.get(f"/api/recordings/{rec_id}/audio")
    assert resp.status_code == 200
    assert resp.content == b"fake-audio-bytes"
    assert resp.headers["content-type"] == "audio/mp4"


def test_download_audio_other_users_recording_is_404(client, tmp_path, monkeypatch, fake_dispatcher):
    monkeypatch.setenv("TABIT_STORAGE_DIR", str(tmp_path))
    _register(client, "alice")
    rec_id = _upload(client, "a.m4a").json()["id"]
    client.post("/api/auth/logout")
    _register(client, "bob")
    assert client.get(f"/api/recordings/{rec_id}/audio").status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest tests/test_recordings.py -k audio -v`
Expected: FAIL — 404 (route not defined yet).

- [ ] **Step 3: Implement the endpoint**

In `app/routers/recordings.py`, add these imports at the top (alongside the existing imports):

```python
import os

from fastapi.responses import FileResponse
```

Add this module-level constant after the `router = APIRouter(...)` line:

```python
_AUDIO_MEDIA_TYPES = {
    "m4a": "audio/mp4",
    "mp4": "audio/mp4",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
}
```

Add this endpoint (place it next to `get_recording`, before `delete_recording`):

```python
@router.get("/{recording_id}/audio")
def get_recording_audio(
    recording_id: str, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)
) -> FileResponse:
    rec = get_owned_recording(db, user, recording_id)
    if not rec.stored_path or not os.path.exists(rec.stored_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audio file not found")
    media_type = _AUDIO_MEDIA_TYPES.get(rec.format, "application/octet-stream")
    return FileResponse(rec.stored_path, media_type=media_type, filename=rec.original_filename)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_recordings.py -k audio -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full backend suite**

Run: `.venv/bin/pytest -q`
Expected: all pass (72 passed, 3 skipped). *(No commit — git disabled.)*

---

### Task 2: Frontend scaffold + tooling

Stand up Vite/React/TS with Vitest + RTL + MSW, the dev proxy, and a passing smoke test. Deliverable: `npm test` runs and a trivial render test passes.

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/tsconfig.node.json`, `frontend/index.html`, `frontend/.gitignore`
- Create: `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/index.css`
- Create: `frontend/src/test/setup.ts`, `frontend/src/test/server.ts`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Produces: a working `npm test` (Vitest), `npm run dev` (proxying `/api`), `npm run build`; an `App` component; the MSW `server` exported from `src/test/server.ts`.

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "tabit-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.51.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.0",
    "msw": "^2.4.0",
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run (from `frontend/`): `npm install`
Expected: completes, creates `node_modules` and `package-lock.json`. If it fails on network, report BLOCKED with the error.

- [ ] **Step 3: Create config files**

`frontend/vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
```

`frontend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`frontend/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

`frontend/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tabit</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`frontend/.gitignore`:

```
node_modules
dist
*.local
```

- [ ] **Step 4: Create the base app + styles**

`frontend/src/index.css`:

```css
:root {
  --bg: #14161a;
  --panel: #1e2127;
  --text: #e6e8ec;
  --muted: #9aa0a8;
  --accent: #4f8cff;
  --danger: #ff5d5d;
  --ok: #46c98b;
  font-family: system-ui, -apple-system, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); }
.container { max-width: 880px; margin: 0 auto; padding: 16px; }
button { font: inherit; cursor: pointer; border-radius: 8px; border: 1px solid #2c313a;
  background: var(--panel); color: var(--text); padding: 8px 12px; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button.danger { background: transparent; border-color: var(--danger); color: var(--danger); }
button:disabled { opacity: 0.5; cursor: default; }
input, select { font: inherit; background: var(--panel); color: var(--text);
  border: 1px solid #2c313a; border-radius: 8px; padding: 8px; }
a { color: var(--accent); }
.card { background: var(--panel); border: 1px solid #2c313a; border-radius: 12px; padding: 12px; }
.error { color: var(--danger); }
.muted { color: var(--muted); }
@media (max-width: 600px) { .container { padding: 12px; } }
```

`frontend/src/App.tsx`:

```tsx
export default function App() {
  return (
    <div className="container">
      <h1>Tabit</h1>
    </div>
  );
}
```

`frontend/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 5: Create the test harness**

`frontend/src/test/server.ts`:

```ts
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

// Default: logged out. Tests override per-case with `server.use(...)`.
export const handlers = [
  http.get("/api/auth/me", () => new HttpResponse(null, { status: 401 })),
];

export const server = setupServer(...handlers);
```

`frontend/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 6: Write the smoke test**

`frontend/src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the app title", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "Tabit" })).toBeInTheDocument();
});
```

- [ ] **Step 7: Run the test**

Run (from `frontend/`): `npm test`
Expected: PASS (1 test). Also run `npm run build` and confirm it compiles with no TypeScript errors.

*(No commit — git disabled.)*

---

### Task 3: Typed API client + music constants

A typed `fetch` wrapper (cookie auth, JSON, error normalization) and the chord vocabulary constants.

**Files:**
- Create: `frontend/src/api/types.ts`, `frontend/src/api/client.ts`, `frontend/src/api/music.ts`
- Test: `frontend/src/api/client.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `UserOut`, `AnalysisOut`, `RecordingOut`, `SegmentOut`, `ChartOut`, `Credentials`.
  - `client.ts`: `class ApiError extends Error { status: number; detail: string }`; `api.get<T>(path)`, `api.post<T>(path)`, `api.postJson<T>(path, body)`, `api.patchJson<T>(path, body)`, `api.postForm<T>(path, form)`, `api.del(path)`.
  - `music.ts`: `ROOTS: string[]` (17 names matching `^[A-G][b#]?$`), `QUALITIES: readonly ["maj","min","dom7","maj7","min7"]`, `QUALITY_LABELS: Record<string,string>`.

- [ ] **Step 1: Write the failing test**

`frontend/src/api/client.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `npm test -- client`
Expected: FAIL — cannot import `./client`.

- [ ] **Step 3: Implement types, client, and music constants**

`frontend/src/api/types.ts`:

```ts
export interface Credentials {
  username: string;
  password: string;
}

export interface UserOut {
  id: string;
  username: string;
}

export interface AnalysisOut {
  status: "pending" | "running" | "done" | "failed";
  bpm: number | null;
  detected_key_tonic: string | null;
  detected_key_mode: string | null;
  engine_version: string | null;
  error: string | null;
}

export interface RecordingOut {
  id: string;
  original_filename: string;
  format: string;
  duration_seconds: number | null;
  status: string;
  analysis: AnalysisOut | null;
}

export interface SegmentOut {
  id: string;
  start_time: number;
  end_time: number;
  chord_root: string;
  chord_quality: string;
  roman_numeral: string;
}

export interface ChartOut {
  id: string;
  recording_id: string;
  key_tonic: string;
  key_mode: string;
  segments: SegmentOut[];
}
```

`frontend/src/api/client.ts`:

```ts
export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const detail = (data && typeof data.detail === "string" && data.detail) || res.statusText;
    throw new ApiError(res.status, detail);
  }
  return data as T;
}

const jsonHeaders = { "Content-Type": "application/json" };

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string) => request<T>(path, { method: "POST" }),
  postJson: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", headers: jsonHeaders, body: JSON.stringify(body) }),
  patchJson: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(body) }),
  postForm: <T>(path: string, form: FormData) =>
    request<T>(path, { method: "POST", body: form }),
  del: (path: string) => request<void>(path, { method: "DELETE" }),
};
```

`frontend/src/api/music.ts`:

```ts
// Note names accepted by the backend (^[A-G][b#]?$), in chromatic-ish order.
export const ROOTS = [
  "C", "C#", "Db", "D", "D#", "Eb", "E", "F",
  "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B",
];

export const QUALITIES = ["maj", "min", "dom7", "maj7", "min7"] as const;

export const QUALITY_LABELS: Record<(typeof QUALITIES)[number], string> = {
  maj: "Major",
  min: "Minor",
  dom7: "Dominant 7th",
  maj7: "Major 7th",
  min7: "Minor 7th",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `frontend/`): `npm test -- client`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full frontend suite**

Run: `npm test`
Expected: all pass.

---

### Task 4: Auth context + hook

`AuthProvider` exposes the current user (from `GET /me`, treating 401 as logged-out) and login/register/logout actions via TanStack Query mutations.

**Files:**
- Create: `frontend/src/auth/AuthContext.tsx`
- Test: `frontend/src/auth/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `api`, `ApiError`, `UserOut`, `Credentials`.
- Produces:
  - `AuthProvider({ children })`.
  - `useAuth(): { user: UserOut | null; isLoading: boolean; login(c): Promise<UserOut>; register(c): Promise<UserOut>; logout(): Promise<void>; }`.

- [ ] **Step 1: Write the failing test**

`frontend/src/auth/AuthContext.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `npm test -- AuthContext`
Expected: FAIL — cannot import `./AuthContext`.

- [ ] **Step 3: Implement the auth context**

`frontend/src/auth/AuthContext.tsx`:

```tsx
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
      queryClient.setQueryData(["me"], null);
      queryClient.clear();
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
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `frontend/`): `npm test -- AuthContext`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full frontend suite**

Run: `npm test`
Expected: all pass.

---

### Task 5: Login / Register pages, routing, protected routes

Forms for login and register, a `ProtectedRoute` that redirects logged-out users to `/login`, and the shared test render helper.

**Files:**
- Create: `frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/RegisterPage.tsx`, `frontend/src/components/ProtectedRoute.tsx`, `frontend/src/test/utils.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/main.tsx`
- Test: `frontend/src/pages/LoginPage.test.tsx`, `frontend/src/components/ProtectedRoute.test.tsx`

**Interfaces:**
- Consumes: `useAuth`, `ApiError`.
- Produces: `LoginPage`, `RegisterPage`, `ProtectedRoute({ children })`, and `renderWithProviders(ui, { route?, path? })` test helper. `App` now declares routes: `/login`, `/register`, `/` (protected → LibraryPage placeholder), `/recordings/:recordingId` (protected → ChartEditorPage placeholder).

- [ ] **Step 1: Create the test render helper**

`frontend/src/test/utils.tsx`:

```tsx
import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../auth/AuthContext";

interface Options {
  route?: string;
  path?: string;
}

export function renderWithProviders(ui: ReactElement, { route = "/", path }: Options = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree: ReactNode = path ? (
    <Routes>
      <Route path={path} element={ui} />
    </Routes>
  ) : (
    ui
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{tree}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
```

- [ ] **Step 2: Write the failing tests**

`frontend/src/pages/LoginPage.test.tsx`:

```tsx
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
```

`frontend/src/components/ProtectedRoute.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import ProtectedRoute from "./ProtectedRoute";

test("redirects to /login when logged out", async () => {
  renderWithProviders(
    <ProtectedRoute>
      <p>secret</p>
    </ProtectedRoute>,
    { route: "/", path: "/" },
  );
  // Default /me handler is 401 -> redirect; secret content must not appear.
  expect(await screen.findByText(/redirected to login/i)).toBeInTheDocument();
});

test("renders children when logged in", async () => {
  server.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "u1", username: "alice" })));
  renderWithProviders(
    <ProtectedRoute>
      <p>secret</p>
    </ProtectedRoute>,
    { route: "/", path: "/" },
  );
  expect(await screen.findByText("secret")).toBeInTheDocument();
});
```

For the redirect test to assert on a destination, the `App` route table must render a recognizable `/login`. The ProtectedRoute test renders only `ProtectedRoute`, so add a sibling login route in the helper render. Update the redirect test to include the login destination by rendering through `App` instead — replace the first test body with:

```tsx
test("redirects to /login when logged out", async () => {
  renderWithProviders(<App />, { route: "/" });
  expect(await screen.findByRole("heading", { name: /log in/i })).toBeInTheDocument();
});
```

and add `import App from "../App";` at the top of the ProtectedRoute test. (Keep the "renders children when logged in" test as written.)

- [ ] **Step 3: Run tests to verify they fail**

Run (from `frontend/`): `npm test -- LoginPage ProtectedRoute`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement ProtectedRoute and the pages**

`frontend/src/components/ProtectedRoute.tsx`:

```tsx
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <p className="muted container">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

`frontend/src/pages/LoginPage.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login({ username, password });
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <h1>Log in</h1>
      <form onSubmit={onSubmit} className="card">
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="muted">
        No account? <Link to="/register">Register</Link>
      </p>
    </div>
  );
}
```

`frontend/src/pages/RegisterPage.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await register({ username, password });
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <h1>Register</h1>
      <form onSubmit={onSubmit} className="card">
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="muted">
        Have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Wire routes in App.tsx and AuthProvider in main.tsx**

Replace `frontend/src/App.tsx`:

```tsx
import { Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

function LibraryPlaceholder() {
  return <div className="container"><h1>Library</h1></div>;
}
function EditorPlaceholder() {
  return <div className="container"><h1>Chart</h1></div>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<ProtectedRoute><LibraryPlaceholder /></ProtectedRoute>} />
      <Route
        path="/recordings/:recordingId"
        element={<ProtectedRoute><EditorPlaceholder /></ProtectedRoute>}
      />
    </Routes>
  );
}
```

In `frontend/src/main.tsx`, wrap `<App />` in `<AuthProvider>` (inside `BrowserRouter`). Add the import `import { AuthProvider } from "./auth/AuthContext";` and change the render tree so it reads:

```tsx
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
```

Update `frontend/src/App.test.tsx` (the Task 2 smoke test asserted an `<h1>Tabit</h1>` that no longer exists at `/`). Replace its body with:

```tsx
import { screen } from "@testing-library/react";
import { renderWithProviders } from "./test/utils";
import App from "./App";

test("logged-out user landing on / sees the login page", async () => {
  renderWithProviders(<App />, { route: "/" });
  expect(await screen.findByRole("heading", { name: /log in/i })).toBeInTheDocument();
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run (from `frontend/`): `npm test`
Expected: PASS (LoginPage 2, ProtectedRoute 2, App 1, plus prior tests). Run `npm run build` to confirm no TypeScript errors.

---

### Task 6: Library page (list, upload, status polling, delete, re-run)

The signed-in user's recordings with live analysis status; upload (reads duration client-side), delete, and re-run.

**Files:**
- Create: `frontend/src/library/audioDuration.ts`, `frontend/src/library/useRecordings.ts`, `frontend/src/library/UploadButton.tsx`, `frontend/src/components/AnalysisStatusBadge.tsx`, `frontend/src/pages/LibraryPage.tsx`
- Modify: `frontend/src/App.tsx` (use real `LibraryPage`)
- Test: `frontend/src/library/useRecordings.test.tsx`, `frontend/src/pages/LibraryPage.test.tsx`

**Interfaces:**
- Consumes: `api`, `RecordingOut`, `AnalysisStatusBadge`, `readAudioDuration`.
- Produces:
  - `audioDuration.ts`: `readAudioDuration(file: File): Promise<number | null>`.
  - `useRecordings()`: `{ recordings, isLoading, upload(file), remove(id), reanalyze(id), isUploading }` — list query polls every 2000ms while any analysis is `pending`/`running`.
  - `AnalysisStatusBadge({ analysis: AnalysisOut | null })`.
  - `UploadButton({ onUpload, busy })`.
  - `LibraryPage`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/library/useRecordings.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../test/server";
import { useRecordings } from "./useRecordings";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

test("loads the recordings list", async () => {
  server.use(
    http.get("/api/recordings", () =>
      HttpResponse.json([
        { id: "r1", original_filename: "a.m4a", format: "m4a", duration_seconds: 12, status: "uploaded",
          analysis: { status: "done", bpm: 120, detected_key_tonic: "C", detected_key_mode: "major", engine_version: "template-v1", error: null } },
      ]),
    ),
  );
  const { result } = renderHook(() => useRecordings(), { wrapper });
  await waitFor(() => expect(result.current.recordings).toHaveLength(1));
  expect(result.current.recordings[0].original_filename).toBe("a.m4a");
});

test("upload posts multipart form with the file", async () => {
  let received: FormData | null = null;
  server.use(
    http.get("/api/recordings", () => HttpResponse.json([])),
    http.post("/api/recordings", async ({ request }) => {
      received = await request.formData();
      return HttpResponse.json(
        { id: "r9", original_filename: "new.m4a", format: "m4a", duration_seconds: 5, status: "uploaded", analysis: { status: "pending", bpm: null, detected_key_tonic: null, detected_key_mode: null, engine_version: null, error: null } },
        { status: 201 },
      );
    }),
  );
  const { result } = renderHook(() => useRecordings(), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  const file = new File([new Uint8Array([1, 2, 3])], "new.m4a", { type: "audio/mp4" });
  await result.current.upload(file);
  expect(received).not.toBeNull();
  expect((received!.get("file") as File).name).toBe("new.m4a");
});
```

`frontend/src/pages/LibraryPage.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import LibraryPage from "./LibraryPage";

function login() {
  server.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "u1", username: "alice" })));
}

test("lists recordings with their analysis status", async () => {
  login();
  server.use(
    http.get("/api/recordings", () =>
      HttpResponse.json([
        { id: "r1", original_filename: "song.m4a", format: "m4a", duration_seconds: 30, status: "uploaded",
          analysis: { status: "done", bpm: 96, detected_key_tonic: "G", detected_key_mode: "major", engine_version: "template-v1", error: null } },
      ]),
    ),
  );
  renderWithProviders(<LibraryPage />);
  expect(await screen.findByText("song.m4a")).toBeInTheDocument();
  expect(screen.getByText(/done/i)).toBeInTheDocument();
});

test("shows an empty state when there are no recordings", async () => {
  login();
  server.use(http.get("/api/recordings", () => HttpResponse.json([])));
  renderWithProviders(<LibraryPage />);
  expect(await screen.findByText(/no recordings yet/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`): `npm test -- useRecordings LibraryPage`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the duration reader and hooks**

`frontend/src/library/audioDuration.ts`:

```ts
// Reads media duration in the browser. Resolves null if it can't be determined.
export function readAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}
```

`frontend/src/library/useRecordings.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { RecordingOut } from "../api/types";
import { readAudioDuration } from "./audioDuration";

const KEY = ["recordings"];

function anyInProgress(list: RecordingOut[] | undefined): boolean {
  return !!list?.some((r) => r.analysis?.status === "pending" || r.analysis?.status === "running");
}

export function useRecordings() {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<RecordingOut[]>("/api/recordings"),
    refetchInterval: (query) => (anyInProgress(query.state.data) ? 2000 : false),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: KEY });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const duration = await readAudioDuration(file);
      if (duration != null) form.append("duration_seconds", String(duration));
      return api.postForm<RecordingOut>("/api/recordings", form);
    },
    onSuccess: invalidate,
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => api.del(`/api/recordings/${id}`),
    onSuccess: invalidate,
  });

  const reanalyzeMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/recordings/${id}/analyze`),
    onSuccess: invalidate,
  });

  return {
    recordings: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    upload: (file: File) => uploadMut.mutateAsync(file),
    remove: (id: string) => removeMut.mutateAsync(id),
    reanalyze: (id: string) => reanalyzeMut.mutateAsync(id),
    isUploading: uploadMut.isPending,
  };
}
```

- [ ] **Step 4: Implement the components and page**

`frontend/src/components/AnalysisStatusBadge.tsx`:

```tsx
import type { AnalysisOut } from "../api/types";

const COLORS: Record<string, string> = {
  pending: "var(--muted)",
  running: "var(--accent)",
  done: "var(--ok)",
  failed: "var(--danger)",
};

export default function AnalysisStatusBadge({ analysis }: { analysis: AnalysisOut | null }) {
  const status = analysis?.status ?? "pending";
  return (
    <span style={{ color: COLORS[status] ?? "var(--muted)", fontWeight: 600 }}>
      {status}
      {analysis?.status === "done" && analysis.bpm != null && (
        <span className="muted" style={{ fontWeight: 400 }}>
          {" "}· {Math.round(analysis.bpm)} BPM · {analysis.detected_key_tonic} {analysis.detected_key_mode}
        </span>
      )}
      {analysis?.status === "failed" && analysis.error && (
        <span className="muted" style={{ fontWeight: 400 }}> · {analysis.error}</span>
      )}
    </span>
  );
}
```

`frontend/src/library/UploadButton.tsx`:

```tsx
import { useRef } from "react";

export default function UploadButton({
  onUpload,
  busy,
}: {
  onUpload: (file: File) => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.m4a,.mp3,.wav,.mp4"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
      <button className="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Uploading…" : "Upload recording"}
      </button>
    </>
  );
}
```

`frontend/src/pages/LibraryPage.tsx`:

```tsx
import { Link } from "react-router-dom";
import AnalysisStatusBadge from "../components/AnalysisStatusBadge";
import UploadButton from "../library/UploadButton";
import { useRecordings } from "../library/useRecordings";

export default function LibraryPage() {
  const { recordings, isLoading, upload, remove, reanalyze, isUploading } = useRecordings();

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Library</h1>
        <UploadButton onUpload={upload} busy={isUploading} />
      </div>

      {isLoading && <p className="muted">Loading…</p>}
      {!isLoading && recordings.length === 0 && <p className="muted">No recordings yet. Upload one to start.</p>}

      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
        {recordings.map((r) => (
          <li key={r.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>{r.original_filename}</strong>
                <div><AnalysisStatusBadge analysis={r.analysis} /></div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {r.analysis?.status === "done" && <Link to={`/recordings/${r.id}`}>Open chart</Link>}
                <button onClick={() => reanalyze(r.id)}>Re-analyze</button>
                <button className="danger" onClick={() => remove(r.id)}>Delete</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Use the real LibraryPage in App.tsx**

In `frontend/src/App.tsx`, remove `LibraryPlaceholder` and import the real page: add `import LibraryPage from "./pages/LibraryPage";` and change the `/` route element to `<ProtectedRoute><LibraryPage /></ProtectedRoute>`.

- [ ] **Step 6: Run tests to verify they pass**

Run (from `frontend/`): `npm test`
Expected: PASS (useRecordings 2, LibraryPage 2, plus all prior). Run `npm run build` to confirm no TS errors.

---

### Task 7: Chart data hooks

TanStack Query hooks for the chart and its mutations (add/update/delete segment, transpose). 404 on the chart resolves to `null` (analysis hasn't seeded it yet).

**Files:**
- Create: `frontend/src/chart/useChart.ts`
- Test: `frontend/src/chart/useChart.test.tsx`

**Interfaces:**
- Consumes: `api`, `ApiError`, `ChartOut`, `SegmentOut`.
- Produces: `useChart(recordingId: string)` →
  `{ chart: ChartOut | null; isLoading: boolean; addSegment(input): Promise<SegmentOut>; updateSegment(segmentId, patch): Promise<SegmentOut>; deleteSegment(segmentId): Promise<void>; transpose(semitones): Promise<ChartOut>; }`
  where `input = {start_time,end_time,chord_root,chord_quality}` and `patch = Partial<{start_time,end_time,chord_root,chord_quality}>`. All mutations invalidate `["chart", recordingId]`.

- [ ] **Step 1: Write the failing test**

`frontend/src/chart/useChart.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { server } from "../test/server";
import { useChart } from "./useChart";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const CHART = {
  id: "c1", recording_id: "r1", key_tonic: "C", key_mode: "major",
  segments: [
    { id: "s1", start_time: 0, end_time: 2, chord_root: "C", chord_quality: "maj", roman_numeral: "I" },
  ],
};

test("loads the chart", async () => {
  server.use(http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART)));
  const { result } = renderHook(() => useChart("r1"), { wrapper });
  await waitFor(() => expect(result.current.chart).not.toBeNull());
  expect(result.current.chart!.segments[0].roman_numeral).toBe("I");
});

test("missing chart (404) resolves to null", async () => {
  server.use(
    http.get("/api/recordings/r1/chart", () => HttpResponse.json({ detail: "Chart not found" }, { status: 404 })),
  );
  const { result } = renderHook(() => useChart("r1"), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.chart).toBeNull();
});

test("transpose posts semitones to the chart", async () => {
  let body: unknown = null;
  server.use(
    http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART)),
    http.post("/api/charts/c1/transpose", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ ...CHART, key_tonic: "D" });
    }),
  );
  const { result } = renderHook(() => useChart("r1"), { wrapper });
  await waitFor(() => expect(result.current.chart).not.toBeNull());
  await result.current.transpose(2);
  expect(body).toEqual({ semitones: 2 });
});

test("updateSegment patches the right segment", async () => {
  let body: unknown = null;
  server.use(
    http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART)),
    http.patch("/api/charts/c1/segments/s1", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ ...CHART.segments[0], chord_quality: "min", roman_numeral: "i" });
    }),
  );
  const { result } = renderHook(() => useChart("r1"), { wrapper });
  await waitFor(() => expect(result.current.chart).not.toBeNull());
  await result.current.updateSegment("s1", { chord_quality: "min" });
  expect(body).toEqual({ chord_quality: "min" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `npm test -- useChart`
Expected: FAIL — cannot import `./useChart`.

- [ ] **Step 3: Implement the hook**

`frontend/src/chart/useChart.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../api/client";
import type { ChartOut, SegmentOut } from "../api/types";

export interface SegmentInput {
  start_time: number;
  end_time: number;
  chord_root: string;
  chord_quality: string;
}
export type SegmentPatch = Partial<SegmentInput>;

async function fetchChart(recordingId: string): Promise<ChartOut | null> {
  try {
    return await api.get<ChartOut>(`/api/recordings/${recordingId}/chart`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export function useChart(recordingId: string) {
  const queryClient = useQueryClient();
  const key = ["chart", recordingId];

  const chartQuery = useQuery({ queryKey: key, queryFn: () => fetchChart(recordingId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });
  const chartId = chartQuery.data?.id;

  const addMut = useMutation({
    mutationFn: (input: SegmentInput) =>
      api.postJson<SegmentOut>(`/api/charts/${chartId}/segments`, input),
    onSuccess: invalidate,
  });
  const updateMut = useMutation({
    mutationFn: ({ segmentId, patch }: { segmentId: string; patch: SegmentPatch }) =>
      api.patchJson<SegmentOut>(`/api/charts/${chartId}/segments/${segmentId}`, patch),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (segmentId: string) => api.del(`/api/charts/${chartId}/segments/${segmentId}`),
    onSuccess: invalidate,
  });
  const transposeMut = useMutation({
    mutationFn: (semitones: number) =>
      api.postJson<ChartOut>(`/api/charts/${chartId}/transpose`, { semitones }),
    onSuccess: invalidate,
  });

  return {
    chart: chartQuery.data ?? null,
    isLoading: chartQuery.isLoading,
    addSegment: (input: SegmentInput) => addMut.mutateAsync(input),
    updateSegment: (segmentId: string, patch: SegmentPatch) =>
      updateMut.mutateAsync({ segmentId, patch }),
    deleteSegment: (segmentId: string) => deleteMut.mutateAsync(segmentId),
    transpose: (semitones: number) => transposeMut.mutateAsync(semitones),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `frontend/`): `npm test -- useChart`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full frontend suite**

Run: `npm test`
Expected: all pass.

---

### Task 8: Chart editor — view, audio player, timeline

Render the chart: audio player (from the Task 1 endpoint), BPM + key header, and a proportional timeline of segments showing chord + roman numeral with a moving playhead. Editing comes in Task 9.

**Files:**
- Create: `frontend/src/chart/timeMath.ts`, `frontend/src/chart/Timeline.tsx`, `frontend/src/pages/ChartEditorPage.tsx`
- Modify: `frontend/src/App.tsx` (use real `ChartEditorPage`)
- Test: `frontend/src/chart/timeMath.test.ts`, `frontend/src/chart/Timeline.test.tsx`, `frontend/src/pages/ChartEditorPage.test.tsx`

**Interfaces:**
- Consumes: `useChart`, `api` types, `useRecordings`' recording shape via `GET /api/recordings/{id}`.
- Produces:
  - `timeMath.ts`: `pixelToTime(clientX, rect:{left,width}, duration): number`; `formatTime(seconds): string`.
  - `Timeline.tsx`: `Timeline({ segments, duration, currentTime, selectedId, onSelect })`.
  - `ChartEditorPage` mounted at `/recordings/:recordingId`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/chart/timeMath.test.ts`:

```ts
import { pixelToTime, formatTime } from "./timeMath";

test("pixelToTime maps within bounds", () => {
  expect(pixelToTime(50, { left: 0, width: 100 }, 10)).toBeCloseTo(5);
});

test("pixelToTime clamps to [0, duration]", () => {
  expect(pixelToTime(-20, { left: 0, width: 100 }, 10)).toBe(0);
  expect(pixelToTime(999, { left: 0, width: 100 }, 10)).toBe(10);
});

test("pixelToTime handles zero-width container", () => {
  expect(pixelToTime(10, { left: 0, width: 0 }, 10)).toBe(0);
});

test("formatTime renders mm:ss", () => {
  expect(formatTime(0)).toBe("0:00");
  expect(formatTime(75)).toBe("1:15");
});
```

`frontend/src/chart/Timeline.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Timeline from "./Timeline";

const segments = [
  { id: "s1", start_time: 0, end_time: 2, chord_root: "C", chord_quality: "maj", roman_numeral: "I" },
  { id: "s2", start_time: 2, end_time: 4, chord_root: "G", chord_quality: "maj", roman_numeral: "V" },
];

test("renders each segment's chord and roman numeral", () => {
  render(<Timeline segments={segments} duration={4} currentTime={0} selectedId={null} onSelect={() => {}} />);
  expect(screen.getByText("C")).toBeInTheDocument();
  expect(screen.getByText("I")).toBeInTheDocument();
  expect(screen.getByText("G")).toBeInTheDocument();
  expect(screen.getByText("V")).toBeInTheDocument();
});

test("clicking a segment selects it", async () => {
  const onSelect = vi.fn();
  render(<Timeline segments={segments} duration={4} currentTime={0} selectedId={null} onSelect={onSelect} />);
  await userEvent.click(screen.getByText("G"));
  expect(onSelect).toHaveBeenCalledWith("s2");
});
```

`frontend/src/pages/ChartEditorPage.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import ChartEditorPage from "./ChartEditorPage";

function login() {
  server.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "u1", username: "alice" })));
}

const RECORDING = {
  id: "r1", original_filename: "song.m4a", format: "m4a", duration_seconds: 4, status: "uploaded",
  analysis: { status: "done", bpm: 120, detected_key_tonic: "C", detected_key_mode: "major", engine_version: "template-v1", error: null },
};
const CHART = {
  id: "c1", recording_id: "r1", key_tonic: "C", key_mode: "major",
  segments: [
    { id: "s1", start_time: 0, end_time: 2, chord_root: "C", chord_quality: "maj", roman_numeral: "I" },
    { id: "s2", start_time: 2, end_time: 4, chord_root: "G", chord_quality: "maj", roman_numeral: "V" },
  ],
};

test("shows BPM, key, and the chord timeline", async () => {
  login();
  server.use(
    http.get("/api/recordings/r1", () => HttpResponse.json(RECORDING)),
    http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART)),
  );
  renderWithProviders(<ChartEditorPage />, { route: "/recordings/r1", path: "/recordings/:recordingId" });
  expect(await screen.findByText(/120 BPM/i)).toBeInTheDocument();
  expect(screen.getByText(/key: C major/i)).toBeInTheDocument();
  expect(screen.getByText("I")).toBeInTheDocument();
  expect(screen.getByText("V")).toBeInTheDocument();
});

test("shows analyzing state when the chart is not ready", async () => {
  login();
  server.use(
    http.get("/api/recordings/r1", () =>
      HttpResponse.json({ ...RECORDING, analysis: { ...RECORDING.analysis, status: "running" } }),
    ),
    http.get("/api/recordings/r1/chart", () => HttpResponse.json({ detail: "Chart not found" }, { status: 404 })),
  );
  renderWithProviders(<ChartEditorPage />, { route: "/recordings/r1", path: "/recordings/:recordingId" });
  expect(await screen.findByText(/analyzing/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`): `npm test -- timeMath Timeline ChartEditorPage`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement timeMath**

`frontend/src/chart/timeMath.ts`:

```ts
export function pixelToTime(
  clientX: number,
  rect: { left: number; width: number },
  duration: number,
): number {
  if (rect.width <= 0) return 0;
  const fraction = (clientX - rect.left) / rect.width;
  return Math.max(0, Math.min(duration, fraction * duration));
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
```

- [ ] **Step 4: Implement Timeline**

`frontend/src/chart/Timeline.tsx`:

```tsx
import type { SegmentOut } from "../api/types";

interface Props {
  segments: SegmentOut[];
  duration: number;
  currentTime: number;
  selectedId: string | null;
  onSelect: (segmentId: string) => void;
}

export default function Timeline({ segments, duration, currentTime, selectedId, onSelect }: Props) {
  const span = duration > 0 ? duration : Math.max(1, ...segments.map((s) => s.end_time));
  const playheadPct = Math.min(100, (currentTime / span) * 100);

  return (
    <div style={{ position: "relative", display: "flex", width: "100%", height: 72, gap: 2 }}>
      {segments.map((s) => {
        const widthPct = ((s.end_time - s.start_time) / span) * 100;
        const selected = s.id === selectedId;
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            style={{
              flex: `0 0 ${widthPct}%`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              border: selected ? "2px solid var(--accent)" : "1px solid #2c313a",
              background: selected ? "#26303f" : "var(--panel)",
            }}
          >
            <strong>{s.chord_root}{s.chord_quality === "maj" ? "" : s.chord_quality === "min" ? "m" : s.chord_quality}</strong>
            <span className="muted">{s.roman_numeral}</span>
          </button>
        );
      })}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${playheadPct}%`,
          width: 2,
          background: "var(--accent)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Implement ChartEditorPage (view)**

`frontend/src/pages/ChartEditorPage.tsx`:

```tsx
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { RecordingOut } from "../api/types";
import { useChart } from "../chart/useChart";
import Timeline from "../chart/Timeline";

export default function ChartEditorPage() {
  const { recordingId } = useParams<{ recordingId: string }>();
  const id = recordingId!;
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const recordingQuery = useQuery({
    queryKey: ["recording", id],
    queryFn: () => api.get<RecordingOut>(`/api/recordings/${id}`),
  });
  const { chart, isLoading: chartLoading } = useChart(id);

  const recording = recordingQuery.data;
  const analysis = recording?.analysis ?? null;
  const duration = recording?.duration_seconds ?? 0;

  if (recordingQuery.isLoading || chartLoading) return <p className="muted container">Loading…</p>;

  return (
    <div className="container">
      <p><Link to="/">← Library</Link></p>
      <h1>{recording?.original_filename ?? "Chart"}</h1>

      {analysis?.status === "failed" && (
        <p className="error">Analysis failed: {analysis.error}</p>
      )}

      {!chart && analysis?.status !== "failed" && (
        <p className="muted">Analyzing… the chart will appear when analysis finishes.</p>
      )}

      {chart && (
        <>
          <p className="muted">
            {analysis?.bpm != null && <>{Math.round(analysis.bpm)} BPM · </>}
            Key: {chart.key_tonic} {chart.key_mode}
          </p>

          <audio
            controls
            style={{ width: "100%" }}
            src={`/api/recordings/${id}/audio`}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          />

          <div style={{ marginTop: 12 }}>
            <Timeline
              segments={chart.segments}
              duration={duration}
              currentTime={currentTime}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Use the real ChartEditorPage in App.tsx**

In `frontend/src/App.tsx`, remove `EditorPlaceholder`, add `import ChartEditorPage from "./pages/ChartEditorPage";`, and change the `/recordings/:recordingId` route element to `<ProtectedRoute><ChartEditorPage /></ProtectedRoute>`.

- [ ] **Step 7: Run tests to verify they pass**

Run (from `frontend/`): `npm test`
Expected: PASS (timeMath 4, Timeline 2, ChartEditorPage 2, plus all prior). Run `npm run build`.

> Note on `key: C major` assertion: the editor renders `Key: {chart.key_tonic} {chart.key_mode}` → `Key: C major`; the test matches `/key: C major/i` (case-insensitive). Keep the literal text format `Key: <tonic> <mode>`.

---

### Task 9: Chart editor — editing (chord, boundaries, add/delete, transpose)

A segment editor panel (root + quality selectors, start/end time inputs, delete), an "add segment" action, and a transpose control. All edits go through the Task 7 mutations; the backend re-derives roman numerals, so the timeline updates from the refetched chart.

**Files:**
- Create: `frontend/src/chart/SegmentEditor.tsx`, `frontend/src/chart/TransposeControl.tsx`
- Modify: `frontend/src/pages/ChartEditorPage.tsx`
- Test: `frontend/src/chart/SegmentEditor.test.tsx`, `frontend/src/chart/TransposeControl.test.tsx`, `frontend/src/pages/ChartEditorPage.edit.test.tsx`

**Interfaces:**
- Consumes: `useChart` mutations, `ROOTS`, `QUALITIES`, `QUALITY_LABELS`, `ApiError`.
- Produces:
  - `SegmentEditor({ segment, onSave, onDelete, busy })` — `onSave(patch: SegmentPatch): Promise<void>`; surfaces a 422 detail as an inline error.
  - `TransposeControl({ keyLabel, onTranspose, busy })` — `onTranspose(semitones: number)` with −1/+1 buttons.

- [ ] **Step 1: Write the failing tests**

`frontend/src/chart/SegmentEditor.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import SegmentEditor from "./SegmentEditor";

const segment = {
  id: "s1", start_time: 0, end_time: 2, chord_root: "C", chord_quality: "maj", roman_numeral: "I",
};

test("saving a changed quality calls onSave with the patch", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<SegmentEditor segment={segment} onSave={onSave} onDelete={vi.fn()} busy={false} />);
  await userEvent.selectOptions(screen.getByLabelText(/quality/i), "min");
  await userEvent.click(screen.getByRole("button", { name: /save/i }));
  expect(onSave).toHaveBeenCalledWith({ chord_root: "C", chord_quality: "min", start_time: 0, end_time: 2 });
});

test("shows a validation error from onSave", async () => {
  const onSave = vi.fn().mockRejectedValue(
    Object.assign(new Error("bad"), { name: "ApiError", status: 422, detail: "segment overlaps an existing segment" }),
  );
  render(<SegmentEditor segment={segment} onSave={onSave} onDelete={vi.fn()} busy={false} />);
  await userEvent.click(screen.getByRole("button", { name: /save/i }));
  expect(await screen.findByText(/overlaps/i)).toBeInTheDocument();
});

test("delete calls onDelete", async () => {
  const onDelete = vi.fn();
  render(<SegmentEditor segment={segment} onSave={vi.fn()} onDelete={onDelete} busy={false} />);
  await userEvent.click(screen.getByRole("button", { name: /delete/i }));
  expect(onDelete).toHaveBeenCalled();
});
```

`frontend/src/chart/TransposeControl.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TransposeControl from "./TransposeControl";

test("up button transposes +1 and down transposes -1", async () => {
  const onTranspose = vi.fn();
  render(<TransposeControl keyLabel="C major" onTranspose={onTranspose} busy={false} />);
  await userEvent.click(screen.getByRole("button", { name: /\+1/ }));
  expect(onTranspose).toHaveBeenCalledWith(1);
  await userEvent.click(screen.getByRole("button", { name: /−1|-1/ }));
  expect(onTranspose).toHaveBeenCalledWith(-1);
});
```

`frontend/src/pages/ChartEditorPage.edit.test.tsx`:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import ChartEditorPage from "./ChartEditorPage";

function login() {
  server.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "u1", username: "alice" })));
}
const RECORDING = {
  id: "r1", original_filename: "song.m4a", format: "m4a", duration_seconds: 4, status: "uploaded",
  analysis: { status: "done", bpm: 120, detected_key_tonic: "C", detected_key_mode: "major", engine_version: "template-v1", error: null },
};
const CHART = {
  id: "c1", recording_id: "r1", key_tonic: "C", key_mode: "major",
  segments: [{ id: "s1", start_time: 0, end_time: 4, chord_root: "C", chord_quality: "maj", roman_numeral: "I" }],
};

test("selecting a segment and saving sends a PATCH", async () => {
  login();
  let patched: unknown = null;
  server.use(
    http.get("/api/recordings/r1", () => HttpResponse.json(RECORDING)),
    http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART)),
    http.patch("/api/charts/c1/segments/s1", async ({ request }) => {
      patched = await request.json();
      return HttpResponse.json({ ...CHART.segments[0], chord_quality: "min", roman_numeral: "i" });
    }),
  );
  renderWithProviders(<ChartEditorPage />, { route: "/recordings/r1", path: "/recordings/:recordingId" });
  await userEvent.click(await screen.findByText("I")); // select segment on the timeline
  await userEvent.selectOptions(await screen.findByLabelText(/quality/i), "min");
  await userEvent.click(screen.getByRole("button", { name: /save/i }));
  expect(patched).toMatchObject({ chord_quality: "min" });
});

test("transpose +1 posts to the chart", async () => {
  login();
  let body: unknown = null;
  server.use(
    http.get("/api/recordings/r1", () => HttpResponse.json(RECORDING)),
    http.get("/api/recordings/r1/chart", () => HttpResponse.json(CHART)),
    http.post("/api/charts/c1/transpose", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ ...CHART, key_tonic: "C#" });
    }),
  );
  renderWithProviders(<ChartEditorPage />, { route: "/recordings/r1", path: "/recordings/:recordingId" });
  await screen.findByText("I");
  await userEvent.click(screen.getByRole("button", { name: /\+1/ }));
  expect(body).toEqual({ semitones: 1 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`): `npm test -- SegmentEditor TransposeControl ChartEditorPage.edit`
Expected: FAIL — modules not found / no editor wired.

- [ ] **Step 3: Implement SegmentEditor**

`frontend/src/chart/SegmentEditor.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { SegmentOut } from "../api/types";
import type { SegmentPatch } from "./useChart";
import { ROOTS, QUALITIES, QUALITY_LABELS } from "../api/music";

interface Props {
  segment: SegmentOut;
  onSave: (patch: SegmentPatch) => Promise<void>;
  onDelete: () => void;
  busy: boolean;
}

export default function SegmentEditor({ segment, onSave, onDelete, busy }: Props) {
  const [root, setRoot] = useState(segment.chord_root);
  const [quality, setQuality] = useState(segment.chord_quality);
  const [start, setStart] = useState(segment.start_time);
  const [end, setEnd] = useState(segment.end_time);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRoot(segment.chord_root);
    setQuality(segment.chord_quality);
    setStart(segment.start_time);
    setEnd(segment.end_time);
    setError(null);
  }, [segment.id, segment.chord_root, segment.chord_quality, segment.start_time, segment.end_time]);

  async function save() {
    setError(null);
    try {
      await onSave({ chord_root: root, chord_quality: quality, start_time: start, end_time: end });
    } catch (err) {
      const detail = (err as { detail?: string }).detail;
      setError(detail ?? "Could not save segment");
    }
  }

  return (
    <div className="card" style={{ display: "grid", gap: 8 }}>
      <strong>Edit segment</strong>
      <label>
        Root
        <select value={root} onChange={(e) => setRoot(e.target.value)}>
          {ROOTS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </label>
      <label>
        Quality
        <select value={quality} onChange={(e) => setQuality(e.target.value)}>
          {QUALITIES.map((q) => (
            <option key={q} value={q}>{QUALITY_LABELS[q]}</option>
          ))}
        </select>
      </label>
      <label>
        Start (s)
        <input type="number" step="0.1" value={start} onChange={(e) => setStart(Number(e.target.value))} />
      </label>
      <label>
        End (s)
        <input type="number" step="0.1" value={end} onChange={(e) => setEnd(Number(e.target.value))} />
      </label>
      {error && <p className="error">{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="primary" onClick={save} disabled={busy}>Save</button>
        <button className="danger" onClick={onDelete} disabled={busy}>Delete</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement TransposeControl**

`frontend/src/chart/TransposeControl.tsx`:

```tsx
interface Props {
  keyLabel: string;
  onTranspose: (semitones: number) => void;
  busy: boolean;
}

export default function TransposeControl({ keyLabel, onTranspose, busy }: Props) {
  return (
    <div className="card" style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span>Key: <strong>{keyLabel}</strong></span>
      <button onClick={() => onTranspose(-1)} disabled={busy}>−1</button>
      <button onClick={() => onTranspose(1)} disabled={busy}>+1</button>
      <span className="muted">(transpose — roman numerals stay the same)</span>
    </div>
  );
}
```

- [ ] **Step 5: Wire editing into ChartEditorPage**

In `frontend/src/pages/ChartEditorPage.tsx`: pull the mutations from `useChart`, render `TransposeControl` and (when a segment is selected) `SegmentEditor` plus an "Add segment" button. Update the destructuring and the `chart` block. Replace the `const { chart, isLoading: chartLoading } = useChart(id);` line with:

```tsx
  const { chart, isLoading: chartLoading, addSegment, updateSegment, deleteSegment, transpose } =
    useChart(id);
```

Add this import near the others:

```tsx
import SegmentEditor from "../chart/SegmentEditor";
import TransposeControl from "../chart/TransposeControl";
```

Inside the `{chart && ( ... )}` block, after the `<Timeline .../>` wrapper `</div>`, add:

```tsx
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <TransposeControl
              keyLabel={`${chart.key_tonic} ${chart.key_mode}`}
              onTranspose={(semitones) => transpose(semitones)}
              busy={false}
            />

            <button
              onClick={() => {
                const lastEnd = chart.segments.at(-1)?.end_time ?? 0;
                addSegment({
                  start_time: lastEnd,
                  end_time: Math.min(duration || lastEnd + 1, lastEnd + 1),
                  chord_root: chart.key_tonic,
                  chord_quality: "maj",
                });
              }}
            >
              Add segment
            </button>

            {selectedId && chart.segments.find((s) => s.id === selectedId) && (
              <SegmentEditor
                segment={chart.segments.find((s) => s.id === selectedId)!}
                onSave={(patch) => updateSegment(selectedId, patch)}
                onDelete={() => {
                  deleteSegment(selectedId);
                  setSelectedId(null);
                }}
                busy={false}
              />
            )}
          </div>
```

- [ ] **Step 6: Run tests to verify they pass**

Run (from `frontend/`): `npm test`
Expected: PASS (SegmentEditor 3, TransposeControl 1, ChartEditorPage.edit 2, plus all prior). Run `npm run build`.

---

### Task 10: App shell (header + logout) and docs

A persistent header with the app name, a Library link, and a Logout button (visible only when signed in); plus a frontend README documenting dev, test, build, and the production single-origin deployment.

**Files:**
- Create: `frontend/src/components/Header.tsx`, `frontend/README.md`
- Modify: `frontend/src/App.tsx` (render `Header` above `Routes`)
- Test: `frontend/src/components/Header.test.tsx`

**Interfaces:**
- Consumes: `useAuth`.
- Produces: `Header` (logout calls `useAuth().logout()` then navigates to `/login`).

- [ ] **Step 1: Write the failing test**

`frontend/src/components/Header.test.tsx`:

```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import Header from "./Header";

test("hides logout when logged out", async () => {
  renderWithProviders(<Header />);
  await waitFor(() => expect(screen.queryByRole("button", { name: /log out/i })).not.toBeInTheDocument());
});

test("shows logout when logged in and calls the endpoint", async () => {
  server.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "u1", username: "alice" })));
  let loggedOut = false;
  server.use(
    http.post("/api/auth/logout", () => {
      loggedOut = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  renderWithProviders(<Header />);
  await userEvent.click(await screen.findByRole("button", { name: /log out/i }));
  await waitFor(() => expect(loggedOut).toBe(true));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `npm test -- Header`
Expected: FAIL — cannot import `./Header`.

- [ ] **Step 3: Implement Header**

`frontend/src/components/Header.tsx`:

```tsx
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <header style={{ borderBottom: "1px solid #2c313a" }}>
      <div
        className="container"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, paddingBottom: 12 }}
      >
        <Link to="/" style={{ fontWeight: 700, textDecoration: "none" }}>Tabit</Link>
        {user && (
          <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Link to="/">Library</Link>
            <span className="muted">{user.username}</span>
            <button onClick={onLogout}>Log out</button>
          </nav>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Render Header in App.tsx**

In `frontend/src/App.tsx`, add `import Header from "./components/Header";` and wrap the return so `Header` renders above `Routes`:

```tsx
  return (
    <>
      <Header />
      <Routes>
        {/* ...existing routes unchanged... */}
      </Routes>
    </>
  );
```

- [ ] **Step 5: Write the frontend README**

`frontend/README.md`:

```markdown
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
```

- [ ] **Step 6: Run the full suite and build**

Run (from `frontend/`): `npm test` then `npm run build`
Expected: all tests pass; build succeeds with no TypeScript errors. *(No commit — git disabled.)*

---

## Self-Review

**1. Spec coverage** (from `docs/superpowers/specs/2026-06-17-tabit-design.md`, "Frontend (React)"):

| Spec requirement | Task |
|---|---|
| Login / Register pages; session persists until Log out | 5 (pages), 10 (logout) |
| Library — recordings with analysis status; upload, delete, re-run | 6 |
| Status polling | 6 (`refetchInterval` while pending/running) |
| Chart editor — audio player synced to a timeline of segments | 8 (`<audio>` + Timeline + playhead; needs Task 1 audio endpoint) |
| Inline edit of each chord | 9 (SegmentEditor root/quality) |
| Drag segment boundaries / correct change points | 9 (start/end time inputs) + 8 (`pixelToTime` provided for a future drag handle) |
| Key selector that transposes live | 9 (TransposeControl → POST transpose; chart refetch updates chords, numerals invariant) |
| BPM display | 8 (header line) |
| Mobile-friendly layout | 2 (responsive CSS, viewport meta), used throughout |
| Backend is source of truth for theory (client renders, doesn't recompute) | Global constraint; roman numerals/transpose come only from API responses |

Deferred/again-out-of-scope: waveform visualization (timeline is segment-proportional, not a waveform) — acceptable for v1; pointer-drag of boundaries is scaffolded (`pixelToTime`) but the shipped boundary edit is numeric (jsdom can't test geometry; numeric is mobile-friendly and fully testable).

**2. Placeholder scan:** No TBD/TODO. Every code step shows complete code; every test shows assertions. The `LibraryPlaceholder`/`EditorPlaceholder` in Task 5 are intentional, named interim components explicitly replaced in Tasks 6 and 8.

**3. Type consistency:** `RecordingOut`/`AnalysisOut`/`ChartOut`/`SegmentOut` (Task 3) are used unchanged in Tasks 4/6/7/8/9. `useChart` returns `{chart, isLoading, addSegment, updateSegment, deleteSegment, transpose}` (Task 7) and Task 9 destructures exactly those names. `SegmentInput`/`SegmentPatch` (Task 7) match `SegmentEditor.onSave`'s `SegmentPatch` (Task 9). `api` methods (`get/post/postJson/patchJson/postForm/del`, Task 3) are the only call surface used everywhere. `ROOTS`/`QUALITIES`/`QUALITY_LABELS` (Task 3) feed SegmentEditor (Task 9). `pixelToTime`/`formatTime` (Task 8) signatures match their tests. The audio endpoint path `/api/recordings/{id}/audio` (Task 1) matches the `<audio src>` in Task 8.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-24-tabit-react-frontend.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
