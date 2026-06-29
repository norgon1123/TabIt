# Tabit — Initial Review

**Date:** 2026-06-29
**Reviewer:** Claude Code (initial-review branch)
**Scope:** Whole project — FastAPI backend (`app/`), React/TypeScript frontend
(`frontend/`), and the design docs under `docs/`. Tabit was built from scratch
and had not been run/tested before this review.

## Summary

Tabit is in **solid shape for a v1 skeleton**. The implementation closely follows
the approved [design spec](superpowers/specs/2026-06-17-tabit-design.md): a single
FastAPI service owns auth, storage, persistence, the analysis pipeline, and all
music theory; the React SPA is a thin client. Code is clean, typed, and reasonably
well factored, with good unit-test coverage on both sides.

The main gaps are **not in the code that exists but in what surrounds it**: repo
hygiene (a database and build artifacts are committed), production-hardening for an
internet-exposed multi-user app (open registration, no rate limiting, no upload
size cap), and the fact that the **real audio pipeline has never been exercised
end-to-end** because `ffmpeg` is not installed in this environment.

## Verification performed

| Check | Result |
|-------|--------|
| Backend tests (`pytest`) | **72 passed, 3 skipped** (skips require `ffmpeg`) |
| Frontend tests (`vitest`) | **37 passed** (15 files) |
| Frontend typecheck + build (`tsc -b && vite build`) | **Clean** |
| `ffmpeg` available | **No** — real decode/analysis path not exercised |

So the unit-tested surface is green. What has *not* been validated is the
end-to-end flow on a real voice memo (upload → decode → analyze → chart), because
the decode stage needs `ffmpeg` and the three tests that touch it are skipped.

## Architecture vs. spec

The build matches the design's locked-in decisions:

- **Single source of truth for theory** — `app/music_theory.py` is pure and
  dependency-free; segments store `(root, quality)` and the roman numeral is
  computed on read in `charts.py:_segment_out`, never stored. ✔
- **Transpose = numerals invariant** — `transpose_chart` shifts the key and every
  segment root; numerals are re-derived. ✔
- **Per-user scoping** — every data path filters by the authenticated user
  (`deps.get_owned_recording`, `charts._owned_chart`). ✔
- **Recognizer behind an interface** — `ChordRecognizer` Protocol with
  `TemplateChordRecognizer` as v1; a madmom swap is a one-line change. ✔
- **In-process async jobs** — `JobDispatcher` (ThreadPoolExecutor), each worker
  with its own DB session. ✔
- **Immutable Analysis / editable ChordChart** — re-run deletes and recreates. ✔

## Strengths

- **Auth fundamentals are right.** argon2 password hashing, session tokens via
  `secrets.token_urlsafe`, stored as a SHA-256 hash (not plaintext), delivered in
  an `httpOnly`, `SameSite=Lax` cookie. Server-side revocation on logout.
- **Careful storage I/O.** `storage.save_audio` writes to a temp file and
  `os.replace`s it atomically; `upload_recording` rolls back the DB row *and*
  deletes the just-written file if the commit fails, so neither is orphaned.
- **Music theory is rigorous and well-tested** — transposition, enharmonic
  spelling (`key_prefers_flats`), and roman-numeral degree labeling are covered.
- **Good test coverage** across auth, charts, recordings, jobs, recognizer,
  segments, key estimation, and the frontend chart-editor interactions.
- **Clean dev ergonomics** — Vite proxies `/api` to the backend; frontend builds
  with no type errors.

## Findings

Severity: **High** = fix before exposing to the internet; **Medium** = fix before
real use; **Low** = polish.

| # | Sev | Area | Finding |
|---|-----|------|---------|
| 1 | High | Repo hygiene | `tabit.db` (the SQLite database) and `tabit.egg-info/` are committed to git, and there is **no root `.gitignore`**. The DB will leak local data, cause merge conflicts, and drift from schema. Build artifacts should not be tracked. |
| 2 | High | Auth | **Open registration with no gating and no rate limiting.** The design mentions a config-seeded admin user, but no admin seed nor a toggle to disable open registration exists. `/register` and `/login` have no brute-force protection — a problem for an internet-exposed service. |
| 3 | High | Uploads | **No upload size limit.** `upload_recording` does `file.file.read()`, loading the entire upload into memory. An internet-exposed endpoint with no cap is a memory-exhaustion / DoS vector. |
| 4 | High | Pipeline | **End-to-end analysis is unverified.** `ffmpeg` is absent here, so the decode path and its 3 tests are skipped — the app has never analyzed a real file. `main.py` only *logs* a startup error; uploads are still accepted and silently fail analysis. |
| 5 | Med | Deployment | **No production SPA serving and no CORS.** Dev works via the Vite proxy, but nothing serves the built SPA in production (no static mount, no CORS middleware). The deploy story is unspecified. |
| 6 | Med | Sessions | **Sessions never expire server-side.** `session_max_age_seconds` only sets cookie max-age; the DB `Session` row lives until logout. Abandoned sessions accumulate and a captured cookie stays valid indefinitely. No cleanup/expiry safety net. |
| 7 | Med | Config | `cookie_secure` defaults to `False`. Correct for local dev, but there is **no startup guard** to catch deploying over HTTPS without flipping it. |
| 8 | Med | Validation | `duration_seconds` is **client-supplied** (a form field) and trusted for segment-window validation. A missing/wrong value silently disables the duration bound. Prefer deriving duration server-side from the decoded audio. |
| 9 | Med | UX/data | **Re-analyze silently overwrites manual edits.** The spec calls for an explicit "this overwrites your edits" warning; `LibraryPage` calls `reanalyze(r.id)` directly with no confirm. Backend re-seeds the chart unconditionally. |
| 10 | Low | Auth | `verify_password` catches only `VerificationError`; a malformed stored hash raises `InvalidHash` and would surface as a 500 instead of a clean failure. |
| 11 | Low | Frontend tests | One test (`useRecordings` upload) emits a React `act(...)` warning — a state update isn't wrapped. Tests pass but the warning hints at a missing await. |
| 12 | Low | Frontend | React Router v7 future-flag warnings. Opt into `v7_startTransition` / `v7_relativeSplatPath` to silence and future-proof. |
| 13 | Low | Deps | Running on Python 3.14 / pytest 9 against `>=` floors from the spec era; a Starlette `TestClient`/httpx deprecation warning is already showing. Worth pinning and refreshing. |

## Recommended next steps

1. **Repo hygiene (quick win):** add a root `.gitignore` (`tabit.db`, `*.egg-info/`,
   `.venv/`, `__pycache__/`, `.pytest_cache/`, `frontend/dist/`, `.DS_Store`,
   `.idea/`), then `git rm --cached tabit.db tabit.egg-info -r`.
2. **Install `ffmpeg` and run the full pipeline on a real voice memo** end-to-end.
   This is the single highest-value verification still outstanding. Consider making
   missing `ffmpeg` a hard startup failure (or rejecting uploads) rather than a log line.
3. **Harden the public surface:** cap upload size, add basic rate limiting on
   `/login` and `/register`, and decide the registration policy (seed an admin +
   a `registration_enabled` toggle, or invite-only).
4. **Nail the deployment story:** serve the built SPA (static mount or reverse
   proxy) and add a production-config guard that requires `cookie_secure=True`.
5. **Surface the re-analyze warning** in the frontend before overwriting edits.
6. **Polish:** session expiry/cleanup, `verify_password` robustness, the `act()`
   warning, and dependency pinning.

## Bottom line

The foundation is well-built and faithful to the design — clean code, the right
architecture, and green unit tests on both ends. Before this can be trusted as the
internet-exposed multi-user app it's designed to be, the **High** findings (repo
hygiene, registration/rate-limiting, upload cap) and especially an **end-to-end run
with `ffmpeg` installed** need attention.
