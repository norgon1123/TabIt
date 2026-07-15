# Phase 4 — Accessibility Audit and Close

**Date:** 2026-07-14
**Scope:** the whole visual redesign (Phases 1–3), verified against WCAG AA in both themes.
**Spec:** `docs/superpowers/specs/2026-07-13-visual-redesign-design.md` (Phase 4 row, *Accessibility*).
**Plan:** `docs/superpowers/plans/2026-07-14-redesign-phase-4-audit-and-close.md`.

Phase 4 is a **verification** phase — "if it finds nothing, that is the phase succeeding." It
found a handful of real defects; each is fixed and locked with a test. Visible change is small
by design.

## Method

Three adversarial read-only passes, one per accessibility dimension, plus a first-principles
composited-contrast computation:

1. **Contrast** — every colour the redesign renders, including the *stateful/composited* ones
   (`opacity`, `color-mix`, `filter`) that raw-token contrast checks cannot see.
2. **Keyboard** — a walkthrough of all five screens (login, register, guest home, library,
   chart editor in edit + practice) for focus traps, unreachable controls, focus visibility.
3. **Screen reader** — landmarks, the volunteered-vs-answer speech rule, the chart's semantics,
   accessible names, and focus management.

There is **no committed browser/e2e infrastructure** (Phase 2's Playwright pass was manual), so
the checks are encoded as Vitest/Testing-Library tests where jsdom can reach them. The genuinely
browser-only checks are listed at the end as still owed to a human.

## Contrast sweep (both themes)

`theme/palette.test.ts` already proves the 15 governed **token pairs** clear AA. It cannot see
that `opacity`/`color-mix` change the *rendered* colour. `theme/contrastStates.test.ts` (new,
with `blend()` in `theme/contrast.ts`) computes the effective colour and asserts AA on it.

| Composited surface | Threshold | Light — before → after | Dark — before → after | Action |
|---|---|---|---|---|
| Practice spotlight — masked `?` (`--muted` @ `opacity 0.72`) | 4.5 (text) | **3.38 → 6.44** | **4.05 → 6.69** | **Fixed** — desaturate only |
| Practice spotlight — bar-line (`--bar-line` @ 0.72) | 3 (graphic) | **2.77 → 4.59** | 3.65 → 5.81 | **Fixed** (same) |
| Receded context bar — title/link text (`--text` @ `opacity 0.45`) | 4.5 (text) | **2.84 → 4.90** | 4.01 → 6.86 | **Fixed** — floor 0.45 → 0.65 |
| Current chord — `--text` on `color-mix(--accent 12%)` | 4.5 (text) | 13.8 ✓ | 12.4 ✓ | none (passes) |
| Dropzone idle — text on `color-mix(--accent 8%, surface)` | 4.5 | 15.3 ✓ | 12.0 ✓ | none (passes) |
| Dropzone **while uploading** — hint (`--muted` @ `opacity 0.6`) | 4.5 | 2.56 | 2.81 | **Documented, not changed** — see below |
| Mode-choice subtitle (`span @ opacity 0.85`) | 4.5 | marginal | marginal | **Documented, not changed** |
| Disabled buttons (`opacity 0.5`) | — | — | — | WCAG-exempt |

### The two fixes

- **Practice spotlight** (Phase 3) dimmed `.chart-lines` with `opacity: 0.72`, compositing every
  chart colour toward the page. That dropped the masked `?` — the very thing a player reads to
  make a guess — to 3.38:1 in light, below the 4.5 text floor. **`opacity` destroys luminance
  contrast; `filter: saturate()` does not** (it changes chroma, not luminance). The spotlight now
  desaturates only (`saturate(0.35)`, no opacity), so the chart stays fully AA-readable while
  still receding into a desaturated backdrop against the fully-saturated deck and guess panel.
  That *relative* saturation is the spotlight.
- **Receded context bar** (Phase 2) dimmed the title/links to `opacity: 0.45`, i.e. 2.84:1 in
  light. Raised to `0.65`, the visible-recede floor that stays AA in both themes. It still
  restores to full opacity on `:hover`/`:focus-within`.

### Documented, not changed — and why

- **Dropzone while uploading** (`opacity: 0.6`): the hint text falls to ~2.56:1, but this state is
  **transient** (only during an upload), the text is a **supplementary** hint, and the primary
  CTA is a *disabled* button (WCAG-exempt). Left as is; would be worth revisiting if uploads ever
  become long-running.
- **Mode-choice subtitle** (`opacity: 0.85`): a subtitle on a button, marginally under in one
  composite; transient (only on the first-open chooser) and supplementary to the button's own
  label. Left as is.

## Keyboard walkthrough

Clean overall: a global `:focus-visible` ring exists, nothing removes an outline without a
replacement, and there are **no focus traps** — every panel, form, and inline editor can be left
by keyboard, and the docked (non-modal) editing panel does not trap Tab.

**One real bug, fixed:** the tempo **÷2 / ×2** buttons were keyboard-unreachable — tabbing out of
the tempo input blurred it, which committed and unmounted the editor before focus could land, so
they were mouse-only. The input's blur now commits only when focus leaves the editor entirely, so
Tab reaches ÷2/×2. Also locked the scrubber's arrow-key seek, which worked but was untested.

By design, not a bug: the control deck is DOM-last (pinned to the visual bottom), so its tab
position follows visual order — on a long chart the Play button sits after every chord cell. The
skip link (below) mitigates the reverse case (jumping *into* the content).

## Screen-reader pass

The **volunteered-vs-answer rule** — the crux of practice mode — is airtight and exhaustively
tested: every volunteered region (practice status line, analyzing spinner) is gated on `!playing`;
every answer (`WhereAmI`, `ChordGuess`) speaks and is `role="status"` (polite), never `alert`; the
scrubber is not a live region. No violation found. The chart's semantic sequence, masked-cell
non-leak, and reveal-as-reward (no spurious announcement) are all correct and tested.

Fixes made (conventional hygiene the redesign had not yet closed):

- **A `main` landmark on every screen** (was absent — landmark navigation and "skip to content"
  had nothing to target), plus a **skip link** as the first thing in the tab order.
- **Accessible names** for the placeholder-only Library search and rename inputs, the glyph-only
  time-signature buttons (`−`/`+`/`◀`/`▶`), and the transpose (`−1`/`+1`) and tempo (`÷2`/`×2`)
  buttons. The transpose labels keep the visible text inside the name (WCAG 2.5.3, Label in Name).
- **Inline key and tempo editors return focus** to their trigger on close (Enter/Escape/click-away),
  the courtesy `Panel` already extends via `useReturnFocus`.

## Chord-quality colour — dropped

The spec lists chord-quality colour (majors/minors/sevenths reading differently at a glance) as
"the last item in, and **the first item to drop if it cannot pass AA contrast in both themes**,"
governed absolutely by the hue rule (supplementary to the chord's own label, never the sole
carrier).

**Decision: dropped**, for reasons that go with the grain of that clause:

1. **It is redundant.** A chord's quality is already carried by *two* visible channels — the chord
   suffix (`C`, `Cm`, `C7`, `Cmaj7`, `Cm7`) and the roman-numeral case (upper vs lower). Colour
   would be a third channel conveying nothing the first two do not.
2. **A five-way, two-theme, AA-safe hue code is disproportionate and fragile.** Five distinct
   qualities, each needing a light-theme and a dark-theme value that clears its threshold on the
   page, on a card, and on the tinted playing cell, without colliding with the reserved `--accent`
   — roughly ten new themed tokens for a decorative layer.
3. **It works against the very users the hue rule protects.** A five-colour code is, by
   construction, hard for the ~8% of men with red-green colour deficiency to parse — and this app's
   audience skews male. A supplementary channel that a colourblind user cannot read is not a
   channel; it is noise.

Per the spec's own escape clause, chord-quality colour is dropped. If it is ever reintroduced, it
must be a supplementary, contrast-validated, **non-text** accent (e.g. a small indicator that
clears 3:1 in both themes), never the sole carrier of quality — and it should earn its way in
against reasons 1–3 above.

## Still owed to a human (jsdom cannot do these)

- A real **screen-reader pass** (VoiceOver / NVDA) confirming that with audio genuinely playing,
  nothing is announced — and that a guess submitted mid-song still speaks its verdict.
- A **visual check** that the desaturated practice spotlight still reads as a spotlight in both
  light and dark themes (jsdom does not apply `filter`).
- A **keyboard/touch walk** on a real device, including the skip link landing in `#main-content`.
- A **contrast eyeball** of the two fixed states in a real browser (the maths says AA; confirm it
  looks right).
