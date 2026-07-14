---
name: tabit-context-docs
description: Use when creating or updating Tabit's CONTEXT.md (architecture orientation) or the generated half of AGENTS.md (commands, module map, env vars), or when the user asks to "generate context docs", "refresh CONTEXT.md", "update AGENTS.md", or onboard a new agent/contributor to the Tabit repo. Also runs automatically on merge to main via .github/workflows/context-docs.yml.
---

# Tabit Context Docs

Maintain two root-level docs:

- **CONTEXT.md** — the *mental model*. What Tabit is, how the pieces fit, the data model,
  the analysis pipeline, the invariants. Audience: anyone who needs to understand the
  system before touching it. **You own this whole file.**
- **AGENTS.md** — the *operating manual*. Audience: a coding agent about to make a change.
  **You own only part of this file** — see the zone rule below. It is the canonical
  instructions file (the tool-agnostic standard).
- **CLAUDE.md** — a symlink to `AGENTS.md`, so Claude Code auto-loads the operating manual
  without a second copy. Never edit `CLAUDE.md` directly.

Keep the two disjoint: CONTEXT.md explains *what is true*; AGENTS.md tells you *what to do*.

## The zone rule — read this before touching AGENTS.md

AGENTS.md is split by a marker comment:

    ═══ ▼▼▼ GENERATED BELOW — DO NOT HAND-EDIT ▼▼▼ ═══

**Above the marker is the POLICY ZONE. You must not write there. Ever.**

Those are *decisions* — the base-branch rule, the disposable-data policy, the rules that
bite, the definition of done. They were set by a human and are not derivable from the code,
so **the code cannot be used to "correct" them.** They are exactly the content a regenerator
is most likely to destroy, because they look like prose that has drifted.

**Below the marker is yours.** Facts read off the code: prerequisites, setup, run, test,
build, where code lives, configuration, the eval harness. Rewrite it freely.

Two consequences:

1. **If the code contradicts a policy-zone rule, do not fix the doc. Report the conflict.**
   Either the code has a bug or the human needs to change the policy — both need a human.
   The single worst failure mode of this skill is a "helpful" verification pass that reads
   `app/migrations.py`, concludes migrations are expected, and quietly restores migration
   guidance the user deliberately removed. Don't.
2. **If you learn a durable rule that must survive regeneration, it goes in the policy
   zone** — not into this skill's template, and not only into the generated zone. The zone
   is the mechanism. It replaces the old "never drop these on update" list, which needed a
   new entry every time a policy was added and silently failed when someone forgot.

If the marker is missing from AGENTS.md, **stop and ask** rather than guessing where the
line falls.

## Core rule: verify before you write

**Every fact you write must be checked against the current code, not recalled from this
skill.** The notes below were true when written; the repo drifts. Confirm each:

| Claim | Verify against |
|-------|----------------|
| Stack / deps / Python version | `pyproject.toml`, `frontend/package.json` |
| Commands (run/test/build) | `README.md`, `package.json` scripts, `[tool.pytest.ini_options]` |
| Env vars | `app/config.py` |
| Backend module map | `app/`, `app/audio/`, `app/routers/` |
| Data model | `app/models.py` |
| Analysis pipeline steps | `app/audio/analyzer.py`, `app/jobs.py` |
| Chord engines | `app/audio/recognizer.py`, `app/config.py` (`TABIT_ANALYSIS_ENGINE`) |
| API endpoints | `app/routers/*.py` |
| Frontend structure | `frontend/src/` |
| Open constraints | `docs/TODO.md` |

If a note here contradicts the code, **the code wins for facts** — but never for policy
(see the zone rule). If a module named here no longer exists, drop it.

## Workflow

1. **Detect mode.** If the files exist, you're *updating*. Otherwise *creating*.
2. **Gather facts** — one broad read pass over the files in the table above.
3. **Rewrite CONTEXT.md** in full, from verified facts. Preserve prose the user clearly
   hand-wrote; replace anything the code has outgrown; add sections for new subsystems.
4. **Rewrite ONLY the generated zone of AGENTS.md.** Leave every byte above the marker
   untouched — including the marker comments themselves.
5. **Check the symlink.** `ls -l CLAUDE.md` should show `CLAUDE.md -> AGENTS.md`. If it's a
   real file, fold anything unique into AGENTS.md, then `ln -sf AGENTS.md CLAUDE.md`.
6. **Cross-check** the two files don't contradict each other or the policy zone.
7. **Report** what you verified, what drift you corrected, and — separately and loudly —
   **any place the code contradicts the policy zone.** That list is the most valuable thing
   you produce; it is the only signal that a policy has gone stale.

## Tabit facts (verify each — they have gone stale before)

- **Two services, one origin.** FastAPI backend (`app/`) + React/TS/Vite SPA
  (`frontend/`). Auth is an httpOnly session cookie, so the SPA must be same-origin as the
  API (dev: Vite proxies `/api` → `:8000`).
- **Charts are beat-native.** Segments are `start_beat`/`end_beat` floats on a beat grid;
  seconds are *derived, never persisted*. Edits snap to the half-beat; derived times are
  *displayed* to the centisecond. Any doc saying segments carry seconds-valued
  `start_time`/`end_time` columns, or that positions are "millisecond precision", is
  describing a schema that no longer exists.
- **There are multiple chord engines**, selected by `TABIT_ANALYSIS_ENGINE` — check
  `app/config.py` for the current set. Do not write "template matching (`template-v1`)";
  that was one early engine and the docs have been wrong about this before.
- **`Analysis` is immutable; `ChordChart` is editable.** Re-running analysis creates a fresh
  `Analysis` and **re-seeds the chart, overwriting manual edits.** A sharp edge — say so.
- **ffmpeg is a hard runtime dependency.** Without it, uploads succeed but analysis fails.
- **Heavy deps (torch/demucs/vamp) are optional extras, imported lazily** so the base app
  installs without them.
- **Config is env-driven, prefix `TABIT_`** (`app/config.py`) — read the current list, don't
  copy one from memory.

## CONTEXT.md shape

Sections, each written from verified fact: *What it is* · *Architecture* · *Charts are
beat-native* (the single most important thing to know before touching chart code) · *Guest
mode* · *Backend map* · *Data model* · *Analysis pipeline* (+ status lifecycle
`pending → running → done | failed`) · *Frontend map* · *Invariants*.

## AGENTS.md generated zone — shape

Only these sections, in this order, below the marker:

*Prerequisites* · *Setup* · *Run* · *Test* · *Build* · *Where code lives* ·
*Configuration* · *Chord-accuracy work (Phase 0/1)*

Commands, module paths, and env-var names — nothing else. **No rules, no policy, no
definition of done.** If you find yourself writing the word "must", it belongs in the
policy zone, which means it belongs to a human, which means you stop and report it.

## Common mistakes

- **Writing above the marker.** The cardinal sin. The policy zone is not yours.
- **"Correcting" policy from the code.** `app/migrations.py` exists and runs; that does
  *not* mean migrations are wanted. The disposable-data rule supersedes it. A verification
  pass that restores migration guidance has actively damaged the repo.
- **Copying this skill's notes verbatim** without checking the code. They have been stale
  before — the `template-v1` and "millisecond precision" lines above were both wrong for
  months.
- **Bloating the generated zone with rules** or **stuffing CONTEXT.md with commands.**
- **Overwriting hand-written prose in CONTEXT.md.** Reconcile drift; preserve intent.
- **Editing CLAUDE.md directly**, or committing it as a real file instead of a symlink.
- **Reporting only successes.** The conflicts you find between code and policy are the
  point. Surface them.
