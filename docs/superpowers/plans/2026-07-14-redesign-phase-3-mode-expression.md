# Visual Redesign — Phase 3: Mode Expression — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app its personality and make the two modes finally feel different — the current chord *lifts* off the chart, a named chord *settles* into the cell it was hiding in, and practice mode dims into a spotlight — without volunteering a single word to a screen reader while the song plays, and with every new motion behind `prefers-reduced-motion`.

**Architecture:** Purely additive on top of a working Phase 2. Three small, independent changes: a CSS scale bump on the already-marked `[data-playing="true"]` cell (the third channel the colourblind rule always wanted); a reveal-as-reward animation that Timeline flags when a cell transitions out of the masked set; and a theme-independent practice spotlight driven by a `data-practice` attribute ChartSheet already knows how to compute. No new modules, no new state that outlives a sitting, no API change.

**Tech Stack:** React 18 + TypeScript + Vite. Vitest (jsdom) + Testing Library + MSW. Plain CSS with the Phase 1 token layer.

**Spec:** `docs/superpowers/specs/2026-07-13-visual-redesign-design.md` (Phase 3 row, and *Motion and feedback*, *Theme vs mode*, *Accessibility*).
**Phase 1 (foundation):** complete — tokens, two themes, Figtree, primitives.
**Phase 2 (chart page):** complete — three zones, pinned deck, docked panel, semantic chart, musical scrubber. 452 tests green at the start of this phase.

## Already landed in Phase 2 — do NOT reimplement

Two of the four things the spec files under Phase 3 were built early, in Phase 2. They are done; this phase leaves them alone and does not re-litigate them:

- **The receding context bar.** `ChartContextBar.tsx` dims to `0.45` while playing via `data-receded`, stays focusable, and its transition is already behind `prefers-reduced-motion` (`index.css` "Zone 1"). Covered by `chart/ChartContextBar.test.tsx`.
- **No *volunteered* speech during playback.** The practice status line drops its `role="status"` while `playing` (`ChartSheet.tsx`); the analyzing spinner is gated the same way; `WhereAmI` and `ChordGuess` **answer** and so are never gated. Covered by `pages/ChartEditorPage.practice.test.tsx` ("the practice status line stops announcing while playing") and `chart/ScrubBar.test.tsx`.

This phase adds the **three things that are genuinely missing**: the current-chord *scale bump* (the highlight has colour + border today, not the third channel), the *reveal-as-reward*, and the practice *spotlight*.

## Global Constraints

- **Quiet while playing, rich while paused — precisely: during playback the app never VOLUNTEERS speech, it may ANSWER when spoken to.** This phase adds no live region and no new announcement. The reveal-as-reward is *visual*; the chord it reveals was already banked on the chart at submit time (Phase 2), and `ChordGuess`'s spoken verdict (`role="status"`, never gated) is unchanged. **Do not add an `aria-live` region for the reveal** — the chart is not allowed to narrate itself during playback, and the guess panel already speaks the answer.
- **Hue is never the only channel.** The current-chord highlight must carry **three** channels — colour **plus** a border **plus** a scale bump (spec *Motion* §1). The reveal-as-reward's "correct" signal must be legible **without colour**: the information (the chord appearing where a "?" was) is the channel; the green flash is supplementary (spec *Motion* §2, *Accessibility*).
- **Everything new sits behind `prefers-reduced-motion: reduce`.** Every animation or transition this phase adds must have a reduced-motion override that neutralises it, and the underlying *information* must survive that override (a reduced-motion user still gets the revealed chord, still sees the playing cell's colour and border). `theme/motion.test.ts` enforces this.
- **Practice mode is a MODE treatment, not "the dark theme."** The spotlight dims with `opacity`/`filter` **relative to the current theme** — it must never swap a token or hardcode a colour, so a dark-theme user gets the spotlight too (spec *Theme vs mode*). `theme/palette.test.ts` already fails the build on any hardcoded hex outside the token blocks; keep it that way.
- **Do NOT touch `chart/chordProgress.ts`.** Its GPU-transition scheme (transform/opacity only) is protected by `chordProgress.test.ts` and the transform assertions in `Timeline.test.tsx`. The scale bump is a *CSS state on the cell*, entirely separate from the fill `chordProgress.ts` drives. Build **on** it, do not edit it.
- **Inline `style={{...}}` stays forbidden** for colour, spacing, radius, border, shadow, font, or static layout (`src/ui/noInlineStyle.test.ts`). This phase adds none — every new visual value lands in `index.css`. The only inline styles in the app remain the four runtime-geometry ones in `Timeline.tsx` / `ScrubBar.tsx`.
- **No class renames.** The spec's migration table anticipated a rename of `chord-guess--wrong` / `shake`; this implementation does **not** rename them (it adds, it does not rename), so no existing test is intentionally broken by this phase. Leave `ChordGuess`'s wrong/right/shake classes and their tests as they are.
- **No new product features.** No streaks, no scores. This is expression and accessibility.
- **Definition of done, per `CLAUDE.md`:** `cd frontend && npm test` and `cd frontend && npm run build` both green. Every task ends green and committed. Every new test has been watched failing first.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `frontend/src/theme/motion.test.ts` | A build-time guard: every motion this phase adds (the current-chord scale bump, the reveal settle) is neutralised under `prefers-reduced-motion`, and its underlying information does not depend on the motion. Reads `index.css` as text — the same single-source-of-truth pattern as `palette.test.ts`. |

**Modify:**

| File | Change |
|---|---|
| `frontend/src/index.css` | The scale bump on `[data-playing="true"]` + its reduced-motion reset (Task 1); the `tabit-settle` keyframes on `[data-revealed="true"]` + its reduced-motion reset (Task 2); the practice spotlight on `.chart-workspace[data-practice="true"] .chart-lines` + its reduced-motion reset (Task 3). |
| `frontend/src/chart/Timeline.tsx` | Track which cells have just left the masked set and flag them `data-revealed="true"` so the settle can play once each (Task 2). |
| `frontend/src/chart/Timeline.test.tsx` | The reveal-as-reward behaviour (Task 2). |
| `frontend/src/chart/ChartSheet.tsx` | Add `data-practice={practice ? "true" : undefined}` to `.chart-workspace` (Task 3). |
| `frontend/src/pages/ChartEditorPage.practice.test.tsx` | The spotlight is on in practice, off in edit (Task 3). |

**Do NOT touch:** `chordProgress.ts`, `ChartContextBar.tsx` (done), `usePracticeSession.ts`, `beatMath.ts`, `beatGrid.ts`, `chartLayout.ts`, the drag-resize handles, `ChordGuess.tsx` (its verdict speech and classes are correct as of Phase 2).

---

### Task 1: The current chord lifts — the third channel

Today `[data-playing="true"]` gets a colour wash and an accent border — two channels. The spec (*Motion* §1) wants three: **colour + border + a scale bump.** The bump is the size channel, which a colourblind player reads when the hue is invisible to them, and it is the "lift" the spec asks for. It is a CSS state on the cell, separate from the progress fill `chordProgress.ts` paints — so this touches neither that file nor its tests.

**Files:**
- Modify: `frontend/src/index.css` (the `.chord-cell` and `.chord-cell[data-playing="true"]` rules, ~lines 200–231)
- Test: `frontend/src/theme/motion.test.ts` (create)

**Interfaces:**
- Consumes: the `data-playing="true"` attribute Timeline already sets on the active cell (Phase 2, unchanged).
- Produces: nothing other tasks consume. Task 2 appends to `motion.test.ts`.

- [ ] **Step 1: Read the current rules first**

```bash
cd frontend && sed -n '196,254p' src/index.css
```

Confirm `.chord-cell` has `position: relative` (it does — the scale needs a stacking context to lift above its neighbours) and that `[data-playing="true"]` currently sets only `background` and `border-color`.

- [ ] **Step 2: Write the failing test**

Create `frontend/src/theme/motion.test.ts`. It mirrors `palette.test.ts`'s file read exactly (`resolve(__dirname, "../index.css")`).

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Read the shipped stylesheet as text, so the guard cannot drift from what ships — the
 *  same single-source-of-truth trick palette.test.ts uses for the token contrast checks. */
const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");

/** The body of the FIRST rule whose selector matches, or null. Good enough for these
 *  hand-written, non-nested rules; not a general CSS parser. */
function ruleBody(selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  return m ? m[1] : null;
}

/** Every `@media (prefers-reduced-motion: reduce) { ... }` block body, concatenated. */
function reducedMotionBlocks(): string {
  let out = "";
  const re = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    // Walk braces from the block's opening `{` to find its matching close.
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    out += css.slice(m.index + m[0].length, i - 1);
  }
  return out;
}

describe("the current-chord lift is a third, non-hue channel", () => {
  it("scales the playing cell up — size, which a colourblind player still reads", () => {
    // Colour + border were the two channels the app already had. The scale is the third the
    // spec asks for: hue is never the only channel, and a size change survives colour blindness.
    const body = ruleBody('.chord-cell[data-playing="true"]');
    expect(body).not.toBeNull();
    expect(body).toMatch(/transform:\s*scale\(/);
  });

  it("neutralises that scale under prefers-reduced-motion", () => {
    // The scale is this phase's motion; a reduced-motion user must not get it. Colour and the
    // border remain, so nothing the colourblind rule needs is lost.
    const reduced = reducedMotionBlocks();
    expect(reduced).toMatch(/\.chord-cell\[data-playing="true"\]\s*\{[^}]*transform:\s*none/);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd frontend && npx vitest run src/theme/motion.test.ts
```

Expected: FAIL — the playing rule has no `transform`, and there is no reduced-motion reset for it.

- [ ] **Step 4: Implement the lift**

In `frontend/src/index.css`, add a transition to the base `.chord-cell` rule (so the lift eases in and out). Find the end of the `.chord-cell { ... }` block (the line `color: var(--text);` before its closing `}`) and add, just before the `}`:

```css
  transition: transform 120ms ease;   /* the current-chord lift; reduced-motion resets it below */
```

Then replace the existing playing-cell rule:

```css
/* "Playing" gets colour AND a border. The old hardcoded dark-slate background was one
   channel, and a subtle one at that. */
.chord-cell[data-playing="true"] {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border-color: var(--accent);
}
```

with:

```css
/* "Playing" gets THREE channels — colour, a border, AND a scale bump. Hue is never the only
   signal: the border is presence (not hue) and the scale is size (not hue), so "this chord is
   now" still reads for a player who cannot see the colour. The old app had only the colour. */
.chord-cell[data-playing="true"] {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border-color: var(--accent);
  transform: scale(1.06);
  z-index: 1;                          /* lift above its neighbours, not under them */
}
```

Then add, immediately after that rule, a reduced-motion reset:

```css
@media (prefers-reduced-motion: reduce) {
  /* Drop the phase's motion. Colour and border stay — two channels, one of them (border
     presence) not hue — so a reduced-motion player loses nothing the colourblind rule needs. */
  .chord-cell { transition: none; }
  .chord-cell[data-playing="true"] { transform: none; }
}
```

- [ ] **Step 5: Run it and watch it pass, then the full suite**

```bash
cd frontend && npx vitest run src/theme/motion.test.ts && npm test && npm run build
```

Expected: PASS. `palette.test.ts` still green (no hex added). The `data-playing` highlight test in `Timeline.test.tsx` still green (the attribute is unchanged).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/index.css frontend/src/theme/motion.test.ts
git commit -m "feat(chart): the current chord lifts — colour, border AND a scale bump

The playing cell had two channels: a colour wash and an accent border. The
spec asks for three, because hue is never the only channel and a scale bump is
a size cue a colourblind player still reads. The lift eases in over 120ms and
sits above its neighbours.

Behind prefers-reduced-motion: the scale drops for a reduced-motion user, and
colour plus the border remain — two channels, one of them not hue — so nothing
the colourblind rule needs is lost. Guarded by theme/motion.test.ts, which
reads index.css so the guard cannot drift from what ships."
```

---

### Task 2: Reveal-as-reward — the named chord settles into its cell

This is the moment practice mode exists to produce, and it is also the accessibility fix. Today a correct guess flashes the guess panel green — one colour channel, ambiguous to a red-green colourblind player. The fix is the better design: **the chord the player just named settles into the cell it was hiding in.** The *information* appearing where a "?" was is a channel that needs no colour at all; the green flash becomes supplementary.

The reveal already happens functionally (Phase 2: `session.reveal` un-masks the cell at submit). What is missing is making it *felt* — a one-shot settle animation on the cell that just left the masked set. Timeline owns the cell, so Timeline flags the transition; the flag only ever grows, so each cell animates exactly once (CSS runs an animation only when it is first applied to an element), with no timers and no replay.

**Files:**
- Modify: `frontend/src/chart/Timeline.tsx`
- Test: `frontend/src/chart/Timeline.test.tsx` (extend)
- Modify: `frontend/src/index.css`
- Test: `frontend/src/theme/motion.test.ts` (append)

**Interfaces:**
- Consumes: the `maskedIds: ReadonlySet<string>` prop Timeline already receives (Phase 2), and the module-level `NO_MASK` constant already in the file.
- Produces: a `data-revealed="true"` attribute on the `<button.chord-cell>` of any segment that has transitioned out of the masked set this sitting. Nothing else consumes it in code; the CSS in this task styles it.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/chart/Timeline.test.tsx`. Reuse the file's `segments` / `GRID` and its `renderTimeline` helper; the reveal test needs an explicit `rerender`, so it renders `<Timeline>` directly with the full prop set (copy the helper's defaults).

```tsx
test("reveal-as-reward: a chord that just left the masked set settles into its cell (#Phase3)", () => {
  const { container, rerender } = render(
    <Timeline
      segments={segments}
      beatsPerMeasure={4}
      measureOffset={0}
      duration={4}
      currentTime={0}
      selectedId={null}
      onSelect={() => {}}
      grid={GRID}
      maskedIds={new Set(["s1", "s2"])}
    />,
  );
  // First paint: both are still questions, so nothing has just been revealed. The settle
  // must not play on a chord that was masked from the start — only on the transition.
  expect(container.querySelector('[data-revealed="true"]')).toBeNull();

  // s2 is named — it leaves the masked set. The cell it was hiding in flags the settle so
  // the chord can animate in. The reward is the information appearing, not a colour.
  rerender(
    <Timeline
      segments={segments}
      beatsPerMeasure={4}
      measureOffset={0}
      duration={4}
      currentTime={0}
      selectedId={null}
      onSelect={() => {}}
      grid={GRID}
      maskedIds={new Set(["s1"])}
    />,
  );
  expect(container.querySelector('[data-segment-id="s2"]')).toHaveAttribute("data-revealed", "true");
  // s1 is still a question; it did not just get revealed.
  expect(container.querySelector('[data-segment-id="s1"]')).not.toHaveAttribute("data-revealed");
});

test("reveal-as-reward does not fire in edit mode, where nothing was ever masked (#Phase3)", () => {
  // maskedIds defaults to NO_MASK, so no cell is a fresh reveal. Without the "only on the
  // transition out of masked" guard, this would flag every chord on first paint.
  const { container } = renderTimeline();
  expect(container.querySelector('[data-revealed="true"]')).toBeNull();
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend && npx vitest run src/chart/Timeline.test.tsx
```

Expected: FAIL — no cell ever carries `data-revealed`.

- [ ] **Step 3: Implement the tracking in Timeline**

In `frontend/src/chart/Timeline.tsx`:

Add `useState` to the React import if it is not already there (it is: `import { useEffect, useMemo, useRef, useState } from "react";`).

Inside the component body, after the `activeId` state block and its effects (right before `function startResize`), add:

```tsx
  // Reveal-as-reward: when a chord is named it leaves the masked set, and the cell it was
  // hiding in should settle the chord into place — the reward IS the information appearing,
  // a channel a colourblind player gets in full, unlike a green flash. We track the ids that
  // have EVER left the masked set this sitting; the set only grows, so each cell gets the
  // flag once and CSS plays the settle once (an animation runs only when first applied to an
  // element). No timer, no replay, and — crucially — nothing fires on first paint, because a
  // cell that was masked from the start never "transitioned" out of it.
  const prevMasked = useRef<ReadonlySet<string>>(maskedIds);
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(NO_MASK);
  useEffect(() => {
    const newly = [...prevMasked.current].filter((id) => !maskedIds.has(id));
    prevMasked.current = maskedIds;
    if (newly.length === 0) return;
    setRevealed((prev) => {
      const next = new Set(prev);
      newly.forEach((id) => next.add(id));
      return next;
    });
  }, [maskedIds]);
```

Then on the `<button className="chord-cell" ...>` element, alongside `data-masked`, add:

```tsx
                  data-revealed={revealed.has(s.id) ? "true" : undefined}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd frontend && npx vitest run src/chart/Timeline.test.tsx
```

Expected: PASS, including every pre-existing Timeline test (the new attribute is `undefined` unless a reveal happened).

- [ ] **Step 5: Add the settle CSS**

In `frontend/src/index.css`, in the "Chord chart" area near `.chord-progress` (after the `.chord-cell[data-masked=...]` rules), add:

```css
/* Reveal-as-reward: the chord the player just named settles into the cell it was hiding in.
   The reveal IS the reward — and, unlike a green flash, it needs no colour to be read, which
   is the point: "correct" is now carried by information appearing where a "?" was, a channel
   a colourblind player gets in full. The motion is garnish; a reduced-motion user gets the
   chord instantly, which is the reward itself. */
.chord-cell[data-revealed="true"] strong { animation: tabit-settle 320ms ease-out; }
@keyframes tabit-settle {
  from { transform: translateY(-35%) scale(0.85); opacity: 0; }
  to   { transform: none; opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .chord-cell[data-revealed="true"] strong { animation: none; }
}
```

- [ ] **Step 6: Append the reduced-motion guard to `motion.test.ts`**

Append to `frontend/src/theme/motion.test.ts`:

```ts
describe("reveal-as-reward reads without colour, and without motion", () => {
  it("settles the revealed chord into its cell", () => {
    // The reward is the chord appearing where a "?" was — an information channel, not a hue.
    const body = ruleBody('.chord-cell[data-revealed="true"] strong');
    expect(body).not.toBeNull();
    expect(body).toMatch(/animation:\s*tabit-settle/);
  });

  it("still defines the tabit-settle keyframes it names", () => {
    expect(css).toMatch(/@keyframes\s+tabit-settle\s*\{/);
  });

  it("neutralises the settle under prefers-reduced-motion, leaving the chord itself intact", () => {
    // A reduced-motion user gets the revealed chord with no animation. The information — the
    // <strong> chord label — is rendered regardless, so turning the motion off costs nothing.
    const reduced = reducedMotionBlocks();
    expect(reduced).toMatch(/\.chord-cell\[data-revealed="true"\]\s*strong\s*\{[^}]*animation:\s*none/);
  });
});
```

- [ ] **Step 7: Run, full suite, commit**

```bash
cd frontend && npx vitest run src/theme/motion.test.ts src/chart/Timeline.test.tsx && npm test && npm run build
```

Expected: PASS. Report the new suite total.

```bash
git add frontend/src/chart/Timeline.tsx frontend/src/chart/Timeline.test.tsx frontend/src/index.css frontend/src/theme/motion.test.ts
git commit -m "feat(practice): reveal-as-reward — the named chord settles into its cell

A correct guess used to flash the panel green and nothing else: one colour
channel, ambiguous to a red-green colourblind player. The fix is also the
better design — the chord the player just named settles into the cell it was
hiding in. The information appearing where a '?' was is a channel that needs no
colour at all; the green flash is now supplementary.

Timeline flags any cell that transitions out of the masked set. The flag only
grows, so each cell animates exactly once (CSS runs an animation only when first
applied) — no timer, no replay, and nothing fires on first paint, because a cell
masked from the start never transitioned out. Behind prefers-reduced-motion the
settle is dropped; the revealed chord label renders regardless, so a
reduced-motion player still gets the reward."
```

---

### Task 3: Practice mode dims into a spotlight

The last of the mode expression: in practice mode the chart recedes and desaturates, so the two fully-lit things on screen are the ones the player is using — the deck (to *listen*) and the guess panel (to *answer*). This is a **mode** treatment, not a theme: it dims with `opacity` and desaturates with a `filter`, **relative to whatever theme the user is in**, so it never swaps a token and a dark-theme user gets the spotlight too.

The dimming goes on `.chart-lines` (the chart's `<ul>`) specifically — **not** on any ancestor of the guess panel. The panel is a sibling of the timeline inside `.chart-workspace`, and the deck is outside `.chart-page__body` entirely, so both stay lit for free. (Dimming a common ancestor with `opacity` would drag the panel down with it — `opacity` creates a group a child cannot escape.)

**Files:**
- Modify: `frontend/src/chart/ChartSheet.tsx`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/pages/ChartEditorPage.practice.test.tsx` (extend)

**Interfaces:**
- Consumes: ChartSheet's existing `practice: boolean` prop.
- Produces: a `data-practice="true"` attribute on `.chart-workspace` whenever practice is on (and absent otherwise). The CSS in this task targets it.

- [ ] **Step 1: Write the failing test**

Append two tests to `frontend/src/pages/ChartEditorPage.practice.test.tsx` (it already has `login`, `serveChart`, `open`, and the `CHART`/`RECORDING` fixtures):

```tsx
test("practice mode dims the chart into a spotlight (#Phase3)", async () => {
  login();
  serveChart();
  const { container } = open("/recordings/r1?mode=practice");

  await waitFor(() => expect(screen.getAllByText("?")).toHaveLength(2));
  // The chart recedes and desaturates so the deck and the guess panel are the lit things.
  // The attribute is the hook the theme-independent CSS dims against; assert the contract.
  expect(container.querySelector(".chart-workspace")).toHaveAttribute("data-practice", "true");
});

test("the editing chart is NOT dimmed — the spotlight is a practice-only treatment (#Phase3)", async () => {
  login();
  serveChart();
  const { container } = open("/recordings/r1?mode=edit");

  await screen.findByText("Gdom7");
  // Mode is about what the app is doing; the editor is not practice, so no spotlight.
  expect(container.querySelector(".chart-workspace")).not.toHaveAttribute("data-practice");
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend && npx vitest run src/pages/ChartEditorPage.practice.test.tsx
```

Expected: FAIL — the workspace never carries `data-practice`.

- [ ] **Step 3: Set the attribute in ChartSheet**

In `frontend/src/chart/ChartSheet.tsx`, find the workspace div:

```tsx
        <div className="chart-workspace" data-panel-open={selected ? "true" : undefined}>
```

and add the practice marker:

```tsx
        <div
          className="chart-workspace"
          data-panel-open={selected ? "true" : undefined}
          data-practice={practice ? "true" : undefined}
        >
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd frontend && npx vitest run src/pages/ChartEditorPage.practice.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Add the spotlight CSS**

In `frontend/src/index.css`, after the `.chart-workspace` block (the docked-panel grid, ~line 277), add:

```css
/* ---- Practice mode: the spotlight ---------------------------------------------------
   Practice is listen-and-answer, so the chart recedes and desaturates and the two lit things
   on screen become the ones in use: the deck (to listen) and the guess panel (to answer).
   This is a MODE treatment, not a theme — it dims with opacity and desaturates with a filter,
   RELATIVE to whatever theme the user is in, so it never swaps a token and a dark-theme user
   gets the spotlight too. The dimming is on .chart-lines only: the guess panel is a sibling,
   and the deck is outside this subtree, so both stay fully lit without any re-lighting. */
.chart-workspace[data-practice="true"] .chart-lines {
  filter: saturate(0.5);
  opacity: 0.72;
  transition: opacity 200ms ease, filter 200ms ease;
}
@media (prefers-reduced-motion: reduce) {
  .chart-workspace[data-practice="true"] .chart-lines { transition: none; }
}
```

- [ ] **Step 6: Run, full suite, commit**

```bash
cd frontend && npm test && npm run build
```

Expected: PASS. `palette.test.ts` stays green — `filter`/`opacity` are theme-independent and add no hex.

**Verify by hand** (jsdom does not lay out or compute filters): open a song in practice mode in both themes and confirm the chart dims and desaturates while the bottom deck and the "Name that chord" panel stay at full brightness; toggle the theme and confirm the spotlight still reads (it dims relative to the theme, not to a fixed colour); switch to the editor and confirm the chart is fully lit.

```bash
git add frontend/src/chart/ChartSheet.tsx frontend/src/index.css frontend/src/pages/ChartEditorPage.practice.test.tsx
git commit -m "feat(practice): dim the chart into a spotlight

In practice mode the chart recedes and desaturates so the two lit things on
screen are the ones the player is using: the deck to listen, the guess panel to
answer. It is a MODE treatment, not a theme — opacity and a filter dim it
relative to whatever theme the user is in, so it swaps no token and a dark-theme
user gets the spotlight too. The dimming is on .chart-lines alone; the panel is
a sibling and the deck is outside the subtree, so both stay lit for free.

Behind prefers-reduced-motion the transition is dropped (the dim itself is a
static state, not motion). ChartSheet marks the workspace data-practice; the CSS
dims against it."
```

---

### Task 4: Close out the phase

- [ ] **Step 1: Whole suite and type-check green**

```bash
cd frontend && npm test && npm run build
```

Report the final test total (452 at the phase start, plus this phase's new tests).

- [ ] **Step 2: Confirm no invariant regressed**

```bash
cd frontend && npx vitest run src/theme/palette.test.ts src/ui/noInlineStyle.test.ts src/chart/chordProgress.test.ts
```

Expected: PASS. The palette (no hardcoded hex, AA in both themes), the inline-style ban, and the untouched `chordProgress` scheme are all intact.

- [ ] **Step 3: Manual walkthrough (jsdom cannot see any of this)**

- Play a chart: the current chord lifts (colour + border + scale). Enable "reduce motion" in the OS and confirm the lift stops but the colour and border remain.
- Practice a song: name a chord and watch it settle into its cell; with reduced motion on, the chord appears instantly (no settle) — the reward survives.
- Practice in both light and dark themes: the chart dims and desaturates; the deck and the guess panel stay lit; the effect reads in both themes.
- Tab through practice mode with a screen reader active while audio plays: nothing is *volunteered*; submitting a guess still speaks its verdict.

- [ ] **Step 4: Review, then finish the branch**

- **REQUIRED SUB-SKILL:** dispatch the `tabit-reviewer` subagent (per `CLAUDE.md`) and address anything it finds.
- Then **REQUIRED SUB-SKILL:** superpowers:finishing-a-development-branch. This phase is Phase 3 of PR #29, which is **already open** against `main` and awaiting phases 3 and 4 — so "finish" here means the commits land on `worktree-design-overhaul-spec` (the PR's branch) and the PR body is updated to describe Phase 3. **Do not open a second PR, and do not merge #29.** Rebase on `origin/main` before pushing (`git fetch origin && git rebase origin/main`); resolve any conflicts and say so.

---

## Self-Review

**Spec coverage (Phase 3 row + *Motion* + *Theme vs mode* + *Accessibility*):**

- Receding context bar → **done in Phase 2**, noted, not redone.
- Practice-mode theme-independent spotlight → Task 3.
- Current-chord lift (three channels) → Task 1.
- Reveal-as-reward → Task 2.
- A11y: one-channel "correct" fixed → Task 2 (the reveal is the hue-independent channel).
- A11y: everything behind `prefers-reduced-motion` → Tasks 1–3 each add a reset; `motion.test.ts` guards it.
- A11y: no *volunteered* speech during playback → **done in Phase 2**, noted; this phase adds no live region.

**Placeholder scan:** none — every code and CSS step shows the exact content.

**Type/name consistency:** `data-playing` (Task 1) and `data-revealed` (Task 2) and `data-practice` (Task 3) are the three attributes; `tabit-settle` is the one keyframes name, defined and referenced in Task 2 and asserted in `motion.test.ts`. `NO_MASK` and `maskedIds` reuse the names already in `Timeline.tsx`. `ruleBody` / `reducedMotionBlocks` are defined once in `motion.test.ts` (Task 1) and reused by Task 2's appended block.
