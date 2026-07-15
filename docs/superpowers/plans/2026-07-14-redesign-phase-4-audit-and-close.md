# Visual Redesign — Phase 4: Audit and Close — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the whole redesign against WCAG AA in both themes, close the accessibility gaps the audit found, and make the binary call on chord-quality colour. Visible change is small by design — this phase is verification, and the fixes are the failures verification turned up.

**Architecture:** No new features (chord-quality colour is evaluated and dropped — see Task 6). The work is: a composited-contrast test harness that catches what raw-token contrast cannot, two contrast fixes it exposes, a `main` landmark + skip link, one keyboard reachability fix, and a cluster of label/focus-return fixes on secondary controls. Each is small and independently testable.

**Tech Stack:** React 18 + TypeScript + Vite. Vitest (jsdom) + Testing Library + MSW. Plain CSS with the Phase 1 token layer. Contrast maths in `src/theme/contrast.ts` (pure, already exists).

**Spec:** `docs/superpowers/specs/2026-07-13-visual-redesign-design.md` — Phase 4 row, *Accessibility*, and the *Scope* note on chord-quality colour ("the first item to drop if it cannot pass AA contrast in both themes").
**Phases 1–3:** complete. 462 tests green at the start of this phase.

## What the audit found (three parallel adversarial passes + a composited-contrast computation)

- **Contrast — two real AA-text failures in *stateful* colours that raw-token `palette.test.ts` cannot see** (it only checks opaque token pairs):
  - **Practice spotlight** — `.chart-workspace[data-practice="true"] .chart-lines { opacity: 0.72 }` (Phase 3) composites every chart colour toward the page. The masked `?` (`--muted`) drops **6.44→3.38 (light)** / 6.69→4.05 (dark) — below the 4.5 text floor — and the bar-line **4.59→2.77 (light)** — below 3. This is the primary content a player reads in practice, and it is persistent. **Root cause:** `opacity` destroys luminance contrast; `filter: saturate()` (the desaturation) does not. Fix: desaturate only.
  - **Receded context bar** — `.chart-context-bar[data-receded="true"] { opacity: 0.45 }` (Phase 2) drops the title/link text to **2.84 (light)** / 4.01 (dark). Restores on `:hover`/`:focus-within`, but the static receded state fails AA. The AA-safe floor is 0.61 (light-bound). Fix: raise to 0.65.
  - **Documented, not fixed** (transient + supplementary): dropzone `opacity: 0.6` while *uploading* (hint → 2.56) — the primary CTA is a disabled, WCAG-exempt button and the text is a transient hint; and `.mode-choice__option span { opacity: 0.85 }` — a subtitle marginally under in one composite. Recorded in the findings doc with rationale.
  - **Clean:** the playing-cell tint `color-mix(--accent 12%)` (text stays 11–14:1) and the dropzone idle tint.
- **Keyboard — one real reachability bug; rings and traps otherwise clean:**
  - **`TempoControl` ÷2/×2 are keyboard-unreachable.** The tempo input's `onBlur` commits and unmounts the editing span, so Tab from the input destroys the ÷2/×2 buttons before focus can land. Mouse works only via their `onMouseDown` preventDefault. There is no keyboard path to a common correction (an octave-off tempo).
  - Global `:focus-visible` ring exists, no `outline:none` anywhere, no focus traps, chord cells and the scrubber are keyboard-operable. The transport being DOM-last is by-design (visual order).
- **Screen reader — the volunteered/answer rule is airtight and exhaustively tested; the gaps are conventional hygiene:**
  - **No `<main>` landmark on any screen.** Every page renders into a bare `<div>`; landmark navigation and "skip to content" have nothing to target. Highest-impact SR finding.
  - Unlabeled **Library search** and **rename** inputs (placeholder-only). Glyph-only **`TimeSignatureControl`** buttons (`−`/`+`/`◀`/`▶`) with no `aria-label`; weaker **Transpose** and **tempo ÷2/×2** names. Inline **`KeyControl`/`TempoControl`** editors don't return focus to their trigger on close.

## Global Constraints

- **WCAG AA in both themes is the gate.** Text 4.5:1 (large-bold text / UI / graphical objects 3:1). Every fix is verified by a test that computes the *effective* (composited) colour, not the raw token.
- **Theme-independent, token-only.** No hardcoded hex; the spotlight fix stays a `filter`, the recede stays an `opacity`. `palette.test.ts` still fails the build on any hex outside the token blocks — keep it green.
- **Do not regress the volunteered/answer rule.** No fix in this phase may add an `aria-live`/`role="status"` that volunteers speech during playback. The `main` landmark and the labels are static semantics, not live regions.
- **Do not touch `chordProgress.ts`.** Untouched since Phase 1; its scheme is protected by its tests.
- **`prefers-reduced-motion`** must not regress — no new motion this phase.
- **No new product features.** Chord-quality colour is evaluated and dropped (Task 6), per the spec's own "first to drop" clause.
- **Definition of done, per `CLAUDE.md`:** `cd frontend && npm test` and `npm run build` both green. Every new test watched failing first.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `frontend/src/theme/contrastStates.test.ts` | Computes the *effective* colour of every composited/stateful surface (opacity, color-mix) and asserts AA in both themes. The guard `palette.test.ts` cannot be, because it only knows opaque token pairs. |
| `frontend/src/components/SkipLink.tsx` + `.test.tsx` | The "Skip to content" link — off-screen until focused, targets the `main` landmark. |
| `docs/phase-4-audit.md` | The audit record: method, the full contrast sweep with numbers, the fixes, the documented-borderline items, and the chord-quality-colour drop rationale. |

**Modify:**

| File | Change |
|---|---|
| `frontend/src/theme/contrast.ts` | Add `blend(fgHex, bgHex, alpha)` — alpha compositing, so the test can compute effective colours. Pure. |
| `frontend/src/index.css` | Spotlight: drop `opacity`, keep/strengthen `saturate` (Task 1). Receded bar: `0.45 → 0.65` (Task 1). Add `.skip-link` styles (Task 2). |
| `frontend/src/App.tsx` | Wrap `<Routes>` in `<main id="main-content">`; render `<SkipLink>` before `<Header>` (Task 2). |
| `frontend/src/App.test.tsx` | Assert a `main` landmark exists (Task 2). |
| `frontend/src/chart/TempoControl.tsx` + `.test.tsx` | Keep the editor open when focus moves *within* it, so ÷2/×2 are Tab-reachable; return focus to the trigger on close (Tasks 3, 5). |
| `frontend/src/chart/KeyControl.tsx` + `.test.tsx` | Return focus to the trigger on close (Task 5). |
| `frontend/src/chart/TimeSignatureControl.tsx` (+ colocated test) | `aria-label` on the four glyph buttons (Task 4). |
| `frontend/src/chart/TransposeControl.tsx` (+ test) | `aria-label` on −1/+1 (Task 4). |
| `frontend/src/pages/LibraryPage.tsx` + `.test.tsx` | `aria-label` on search and rename inputs (Task 4). |
| `frontend/src/chart/ScrubBar.test.tsx` | Lock the existing (untested) Arrow-key seek (Task 3). |

**Do NOT touch:** `chordProgress.ts`, the volunteered/answer live regions (all correct), `Timeline.tsx`'s semantics (correct), the drag-resize handles.

---

### Task 1: Composited-contrast guard, and the two AA-text fixes it exposes

`palette.test.ts` proves the *tokens* clear AA. It cannot see that `opacity`/`color-mix`/`filter` change the *rendered* colour. This task adds that guard and fixes the two failures it finds.

**Files:**
- Modify: `frontend/src/theme/contrast.ts`
- Create: `frontend/src/theme/contrastStates.test.ts`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces: `blend(fgHex: string, bgHex: string, alpha: number): string` in `contrast.ts` — the opaque colour when `fgHex` is painted at `alpha` over `bgHex` (`out = fg·α + bg·(1−α)`, per channel, rounded). Reuses the module's existing hex parsing.

- [ ] **Step 1: Add `blend` to `contrast.ts`**

Append to `frontend/src/theme/contrast.ts` (it already has `parseHex` internally — reuse it; if `parseHex` is not exported, add the small helper inline in `blend`):

```ts
/** The opaque colour produced when `fg` is painted at `alpha` (0–1) over `bg`.
 *  Straight alpha compositing: out = fg·α + bg·(1−α), per sRGB channel. This is how the
 *  browser composites an `opacity` or a `color-mix(... transparent)` — so it is how we must
 *  compute the *effective* colour a user actually sees, which is what AA governs. */
export function blend(fg: string, bg: string, alpha: number): string {
  const f = parseHex(fg);
  const b = parseHex(bg);
  const ch = (i: number) => Math.round(f[i] * alpha + b[i] * (1 - alpha));
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(ch(0))}${hex(ch(1))}${hex(ch(2))}`;
}
```

If `parseHex` is `function parseHex(...)` (not exported), that is fine — `blend` is in the same module. **Read the file first** to confirm the name.

- [ ] **Step 2: Write the failing test**

Create `frontend/src/theme/contrastStates.test.ts`. It reads the tokens straight from `index.css` (like `palette.test.ts`) so it cannot drift, then asserts the *composited* ratios.

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { contrastRatio, blend, AA_TEXT, AA_UI } from "./contrast";

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");

function tokens(selector: string): Record<string, string> {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(`${esc}\\s*\\{([^}]*)\\}`).exec(css);
  if (!block) throw new Error(`No block for ${selector}`);
  const out: Record<string, string> = {};
  for (const [, k, v] of block[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g)) out[k] = v;
  return out;
}
const THEMES = {
  light: tokens(':root, [data-theme="light"]'),
  dark: tokens('[data-theme="dark"]'),
};

/** The stateful/composited surfaces AA must hold on, over and above the raw token pairs. */
describe.each(Object.entries(THEMES))("stateful contrast — %s theme", (_name, t) => {
  it("keeps the practice-spotlight chart readable — the masked '?' stays AA text", () => {
    // The spotlight desaturates but must NOT drop the chart's text contrast: the masked '?'
    // is the very thing a player reads to make a guess. Since the fix desaturates instead of
    // dimming, the effective colour IS the raw token — full contrast. If someone reintroduces
    // an opacity dim on .chart-lines, this fails.
    expect(contrastRatio(t["--muted"], t["--bg"])).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(t["--bar-line"], t["--bg"])).toBeGreaterThanOrEqual(AA_UI);
    // Guard the mechanism: .chart-lines under practice must not carry an `opacity` (which
    // would crush contrast); desaturation is the only allowed dim.
    const rule = /\.chart-workspace\[data-practice="true"\]\s+\.chart-lines\s*\{([^}]*)\}/.exec(css);
    expect(rule, "spotlight rule present").not.toBeNull();
    expect(rule![1]).not.toMatch(/opacity\s*:/);
    expect(rule![1]).toMatch(/filter\s*:\s*saturate/);
  });

  it("keeps the receded context bar's text AA even while it recedes", () => {
    // The bar dims during playback but its title/links are still text: the static receded
    // state must clear 4.5:1. The receded opacity is read from the stylesheet.
    const m = /\.chart-context-bar\[data-receded="true"\]\s*\{[^}]*opacity:\s*([0-9.]+)/.exec(css);
    expect(m, "receded opacity present").not.toBeNull();
    const alpha = parseFloat(m![1]);
    const effective = blend(t["--text"], t["--bg"], alpha);
    expect(contrastRatio(effective, t["--bg"])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("keeps the current chord's label AA on its tinted background", () => {
    // color-mix(--accent 12%, transparent) over the page: verify --text still clears AA.
    const tint = blend(t["--accent"], t["--bg"], 0.12);
    expect(contrastRatio(t["--text"], tint)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
```

- [ ] **Step 3: Run and watch fail**

```bash
cd frontend && ./node_modules/.bin/vitest run src/theme/contrastStates.test.ts
```

Expected: FAIL — the spotlight rule still has `opacity: 0.72` (so the `not.toMatch(/opacity/)` assertion trips), and the receded bar at `0.45` gives ~2.84 (light), below 4.5. **Use `./node_modules/.bin/vitest` — `npx vitest` resolves a broken cached copy in this environment.**

- [ ] **Step 4: Fix the spotlight — desaturate, don't dim**

In `frontend/src/index.css`, replace the practice-spotlight rule:

```css
.chart-workspace[data-practice="true"] .chart-lines {
  filter: saturate(0.5);
  opacity: 0.72;
  transition: opacity 200ms ease, filter 200ms ease;
}
```

with (drop `opacity`; a stronger desaturation carries the "recede" without touching luminance contrast):

```css
/* Desaturation ONLY — never opacity. `opacity` composites the chart toward the page and
   crushes text contrast (the masked "?" fell to 3.4:1); `saturate()` changes chroma, not
   luminance, so the chart stays fully AA-readable while visibly receding into a desaturated
   backdrop against the fully-saturated deck and guess panel. That relative saturation IS the
   spotlight. Verified by theme/contrastStates.test.ts. */
.chart-workspace[data-practice="true"] .chart-lines {
  filter: saturate(0.35);
  transition: filter 200ms ease;
}
```

And update the reduced-motion block for this selector (it referenced `transition: opacity, filter`): change the entry to `transition: none` (it already is `transition: none`, so it stays correct — confirm it still reads `.chart-workspace[data-practice="true"] .chart-lines { transition: none; }`).

- [ ] **Step 5: Fix the receded context bar — raise the floor to AA**

In `frontend/src/index.css`:

```css
.chart-context-bar[data-receded="true"] { opacity: 0.45; }
```

→

```css
/* Recedes during playback, but its title and links are still TEXT — the static receded state
   must clear AA (4.5:1). 0.45 fell to 2.84:1 in the light theme; 0.65 is the visible-recede
   floor that stays AA in both themes. It still restores to full on :hover/:focus-within. */
.chart-context-bar[data-receded="true"] { opacity: 0.65; }
```

- [ ] **Step 6: Run, full suite, commit**

```bash
cd frontend && ./node_modules/.bin/vitest run src/theme/contrastStates.test.ts src/theme/palette.test.ts && npm test && npm run build
```

Expected: PASS (contrast states green, palette still green). Report the suite total.

```bash
git add frontend/src/theme/contrast.ts frontend/src/theme/contrastStates.test.ts frontend/src/index.css docs/superpowers/plans/2026-07-14-redesign-phase-4-audit-and-close.md
git commit -m "fix(a11y): stateful colours meet WCAG AA in both themes

palette.test.ts proves the tokens clear AA but cannot see that opacity/color-mix
change the RENDERED colour. A composited-contrast guard (theme/contrastStates.test.ts
+ blend()) computes the effective colour and caught two failures:

- The practice spotlight dimmed .chart-lines with opacity 0.72, dropping the
  masked '?' to 3.4:1 (light) — below the 4.5 text floor — on the very content a
  player reads to guess. opacity crushes luminance contrast; saturate() does not.
  The spotlight now desaturates only, so the chart stays fully AA-readable while
  still receding against the saturated deck and panel.
- The receded context bar dimmed text to 2.84:1 (light). Raised the floor to 0.65,
  which stays AA in both themes and still visibly recedes.

Watched failing before the fix."
```

---

### Task 2: A `main` landmark, and a skip link

No screen has a `<main>`, so landmark navigation and "skip to content" have nothing to target. One `<main>` around the router covers all five screens.

**Files:**
- Create: `frontend/src/components/SkipLink.tsx`, `frontend/src/components/SkipLink.test.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/App.test.tsx`, `frontend/src/index.css`

**Interfaces:**
- Produces: `SkipLink()` — an `<a href="#main-content">` that is off-screen until focused. `App` renders one `<main id="main-content">`.

- [ ] **Step 1: Write the failing test**

`frontend/src/components/SkipLink.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SkipLink from "./SkipLink";

describe("SkipLink", () => {
  it("is a link that targets the main landmark", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: /skip to content/i });
    expect(link).toHaveAttribute("href", "#main-content");
  });
});
```

And in `frontend/src/App.test.tsx`, add (adapt to the file's existing render helper — read it first):

```tsx
it("gives every screen a main landmark to skip to", async () => {
  // Landmark navigation and the skip link both need a <main>; before this there was none,
  // so a screen-reader user could not jump to the content of any page.
  renderApp("/login"); // use the file's existing render/route helper
  expect(await screen.findByRole("main")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and watch fail**

```bash
cd frontend && ./node_modules/.bin/vitest run src/components/SkipLink.test.tsx src/App.test.tsx
```

Expected: FAIL — no `SkipLink` module; no `main` role.

- [ ] **Step 3: Implement**

`frontend/src/components/SkipLink.tsx`:

```tsx
/** The first thing in the tab order: a link that jumps a keyboard/screen-reader user past
 *  the header straight to the page content. Off-screen until focused (see .skip-link), so it
 *  costs a sighted user nothing and a keyboard user one Tab. */
export default function SkipLink() {
  return (
    <a className="skip-link" href="#main-content">
      Skip to content
    </a>
  );
}
```

`frontend/src/App.tsx` — render the skip link first, and wrap the routes in `<main>`:

```tsx
import SkipLink from "./components/SkipLink";
// ...
  return (
    <>
      <SkipLink />
      <Header />
      <main id="main-content">
        <Routes>
          {/* unchanged */}
        </Routes>
      </main>
    </>
  );
```

`frontend/src/index.css` — add the skip-link style (off-screen until focused). Put it near the top-level layout rules:

```css
/* Off-screen until focused, then it drops into the top-left corner. A keyboard user gets it
   on the first Tab; nobody else ever sees it. */
.skip-link {
  position: absolute;
  left: var(--space-3);
  top: -3rem;
  z-index: 100;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--control-border);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  transition: top 120ms ease;
}
.skip-link:focus { top: var(--space-3); }
@media (prefers-reduced-motion: reduce) { .skip-link { transition: none; } }
```

- [ ] **Step 4: Run, full suite, commit**

```bash
cd frontend && ./node_modules/.bin/vitest run src/components/SkipLink.test.tsx src/App.test.tsx && npm test && npm run build
```

```bash
git add frontend/src/components/SkipLink.tsx frontend/src/components/SkipLink.test.tsx frontend/src/App.tsx frontend/src/App.test.tsx frontend/src/index.css
git commit -m "feat(a11y): a main landmark and a skip link on every screen

No screen had a <main>, so landmark navigation and 'skip to content' had nothing
to target — a screen-reader user could not jump past the header to the page
content of any of the five screens. One <main id=main-content> around the router
covers them all, and a skip link (off-screen until focused) is the first thing in
the tab order.

Watched failing before the fix (no main role, no skip link)."
```

---

### Task 3: Keyboard — make ÷2/×2 reachable, and lock the scrubber's arrow-keys

The tempo ÷2/×2 buttons are keyboard-unreachable: tabbing from the tempo input blurs it, which commits and unmounts the whole editor before focus can land. Fix: keep the editor open while focus stays *within* it.

**Files:**
- Modify: `frontend/src/chart/TempoControl.tsx`, `frontend/src/chart/TempoControl.test.tsx`
- Modify: `frontend/src/chart/ScrubBar.test.tsx`

- [ ] **Step 1: Read `TempoControl.tsx` first**

```bash
cd frontend && cat src/chart/TempoControl.tsx
```

Note the editing span (input + ÷2/×2), the input's `onBlur={commit}`, `commit()` calling `setEditing(false)`, and the buttons' `onMouseDown={e => e.preventDefault()}` (the mouse-only survival hack).

- [ ] **Step 2: Write the failing keyboard test**

Append to `frontend/src/chart/TempoControl.test.tsx` (reuse its render helper — read it first):

```tsx
it("lets a keyboard user Tab from the tempo field to ÷2 and use it", async () => {
  // ÷2/×2 fix an octave-off tempo. A keyboard user tabbing out of the input used to destroy
  // them (onBlur committed and closed the editor), so the correction was mouse-only.
  const onChange = vi.fn();
  renderTempo({ bpm: 120, onChange }); // adapt to the file's helper
  await userEvent.click(screen.getByRole("button", { name: /120 bpm/i })); // open the editor
  await userEvent.tab(); // input -> ÷2
  const half = screen.getByRole("button", { name: /÷2|half/i });
  expect(half).toHaveFocus();
  await userEvent.click(half);
  expect(onChange).toHaveBeenCalledWith(60);
});
```

**Adapt selector names to what `TempoControl.test.tsx` already uses.** If the trigger's accessible name differs, read the file and match it.

- [ ] **Step 3: Run and watch fail**

```bash
cd frontend && ./node_modules/.bin/vitest run src/chart/TempoControl.test.tsx
```

Expected: FAIL — after Tab the ÷2 button is gone (editor closed on blur), so it is not focused.

- [ ] **Step 4: Fix — don't close when focus stays inside the editor**

In `frontend/src/chart/TempoControl.tsx`, change the input's blur handler so it only commits/closes when focus is leaving the editing container. Put a ref on the editing wrapper and check `relatedTarget`:

```tsx
  // Blur commits and closes — UNLESS focus is moving to another control inside the editor
  // (the ÷2/×2 buttons). Without this, Tab from the input destroys those buttons before focus
  // can land on them, making the octave correction mouse-only. This replaces the buttons'
  // onMouseDown preventDefault hack, which only ever helped the mouse.
  const onInputBlur = (e: React.FocusEvent) => {
    if (editorRef.current?.contains(e.relatedTarget as Node | null)) return;
    commit();
  };
```

Add `const editorRef = useRef<HTMLSpanElement | null>(null);`, put `ref={editorRef}` on the editing wrapper element, and use `onBlur={onInputBlur}` on the input. The ÷2/×2 buttons keep working for the mouse; you may leave their `onMouseDown` preventDefault or remove it (removing is cleaner now that blur is handled — but leaving it is harmless; prefer removing and noting why).

- [ ] **Step 5: Lock the scrubber's arrow-key seek (coverage gap)**

`ScrubBar`'s ArrowLeft/ArrowRight seek works but is asserted nowhere. Append to `frontend/src/chart/ScrubBar.test.tsx` (reuse its render helper and the `GRID` const already there from Phase 2):

```tsx
it("seeks with the arrow keys — the keyboard path to scrubbing", async () => {
  const onSeek = vi.fn();
  render(<ScrubBar currentTime={4} duration={16} playing={false} rate={1} grid={GRID} onSeek={onSeek} />);
  const slider = screen.getByRole("slider");
  slider.focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(onSeek).toHaveBeenCalled();
  const forward = onSeek.mock.calls[0][0];
  onSeek.mockClear();
  await userEvent.keyboard("{ArrowLeft}");
  expect(onSeek.mock.calls[0][0]).toBeLessThan(forward);
});
```

**Read `ScrubBar.tsx` first** to confirm the seek step and that Arrow keys call `onSeek`; adapt the assertion to the real step if ±5s.

- [ ] **Step 6: Run, full suite, commit**

```bash
cd frontend && ./node_modules/.bin/vitest run src/chart/TempoControl.test.tsx src/chart/ScrubBar.test.tsx && npm test && npm run build
```

```bash
git add frontend/src/chart/TempoControl.tsx frontend/src/chart/TempoControl.test.tsx frontend/src/chart/ScrubBar.test.tsx
git commit -m "fix(a11y): the tempo ÷2/×2 buttons are reachable by keyboard

Tabbing out of the tempo input blurred it, which committed and unmounted the whole
editor — so the ÷2/×2 octave-correction buttons were destroyed before focus could
land, leaving them mouse-only. The blur now commits only when focus leaves the
editor entirely; Tab from the input reaches ÷2/×2. Also locks the scrubber's
arrow-key seek, which worked but was untested.

Watched the keyboard test fail before the fix."
```

---

### Task 4: Accessible names for the secondary controls

Glyph-only and placeholder-only controls that a screen reader cannot name. All static `aria-label`s — no behaviour change.

**Files:**
- Modify: `frontend/src/chart/TimeSignatureControl.tsx` (+ colocated test if present)
- Modify: `frontend/src/chart/TransposeControl.tsx` (+ test)
- Modify: `frontend/src/pages/LibraryPage.tsx`, `frontend/src/pages/LibraryPage.test.tsx`

- [ ] **Step 1: Read each file, then write the failing tests**

```bash
cd frontend && cat src/chart/TimeSignatureControl.tsx src/chart/TransposeControl.tsx && grep -n "type=\"search\"\|autoFocus\|placeholder\|rename" src/pages/LibraryPage.tsx
```

Add tests that assert the accessible names. For `LibraryPage.test.tsx` (reuse its render+MSW helper):

```tsx
it("labels the search and rename inputs for a screen reader", async () => {
  renderLibrary(); // the file's helper; ensure a recording is present
  expect(await screen.findByRole("searchbox", { name: /search recordings/i })).toBeInTheDocument();
  // open rename on the first row, then:
  // await userEvent.click(screen.getAllByRole("button", { name: /rename/i })[0]);
  // expect(screen.getByRole("textbox", { name: /new name|rename/i })).toBeInTheDocument();
});
```

For `TimeSignatureControl`, assert each of the four buttons has a descriptive name:

```tsx
it("names its glyph buttons", () => {
  renderTimeSig(); // the file's helper
  expect(screen.getByRole("button", { name: /more beats per measure|beats per measure up/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /fewer beats per measure|beats per measure down/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /bar.?line.*(later|shift)/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /bar.?line.*(earlier|shift)/i })).toBeInTheDocument();
});
```

**Adapt the expected names to whatever you write in Step 3 — the test and the label must agree.** If `TimeSignatureControl`/`TransposeControl` have no colocated test file, create one with just this assertion (read the component's existing render needs first).

- [ ] **Step 2: Run and watch fail**

```bash
cd frontend && ./node_modules/.bin/vitest run src/pages/LibraryPage.test.tsx src/chart/TimeSignatureControl.test.tsx src/chart/TransposeControl.test.tsx
```

Expected: FAIL — the glyph buttons have no accessible name; the inputs have only placeholders.

- [ ] **Step 3: Add the labels**

- `TimeSignatureControl.tsx` — `aria-label` on each of the four buttons: "More beats per measure" / "Fewer beats per measure" / "Shift the bar line later" / "Shift the bar line earlier" (match the actual semantics — read the component).
- `TransposeControl.tsx` — `aria-label="Transpose down a semitone"` / `"Transpose up a semitone"` on −1/+1.
- `LibraryPage.tsx` — `aria-label="Search recordings"` on the search input; `aria-label={\`Rename ${recording.original_filename}\`}` (or a static "New name") on the rename input.

- [ ] **Step 4: Run, full suite, commit**

```bash
cd frontend && npm test && npm run build
```

```bash
git add frontend/src/chart/TimeSignatureControl.tsx frontend/src/chart/TransposeControl.tsx frontend/src/pages/LibraryPage.tsx frontend/src/pages/LibraryPage.test.tsx frontend/src/chart/TimeSignatureControl.test.tsx frontend/src/chart/TransposeControl.test.tsx
git commit -m "fix(a11y): accessible names for glyph- and placeholder-only controls

A screen reader announced the time-signature buttons as 'minus, button' /
'left-pointing triangle, button' with no idea which quantity they change, and the
Library search and rename inputs had only placeholders (not a reliable accessible
name). Static aria-labels, no behaviour change.

Watched failing before the fix."
```

---

### Task 5: Inline key/tempo editors return focus on close

`KeyControl` and `TempoControl` unmount their `<select>`/`<input>` on Enter/Escape/outside-click and re-render the trigger button, but nothing returns focus there — a keyboard user lands on `document.body`. `Panel` already solves this with `useReturnFocus`; these inline editors don't use it.

**Files:**
- Modify: `frontend/src/chart/KeyControl.tsx`, `frontend/src/chart/KeyControl.test.tsx`
- Modify: `frontend/src/chart/TempoControl.tsx`, `frontend/src/chart/TempoControl.test.tsx`

- [ ] **Step 1: Write the failing tests**

For each control, assert focus returns to the trigger after closing with Escape. `KeyControl.test.tsx` (reuse its helper):

```tsx
it("returns focus to the trigger when the editor closes", async () => {
  renderKey(); // the file's helper
  const trigger = screen.getByRole("button", { name: /key|C major/i });
  await userEvent.click(trigger);
  await userEvent.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
});
```

Mirror it in `TempoControl.test.tsx` against the tempo trigger.

- [ ] **Step 2: Run and watch fail**

```bash
cd frontend && ./node_modules/.bin/vitest run src/chart/KeyControl.test.tsx src/chart/TempoControl.test.tsx
```

Expected: FAIL — focus is on `body`, not the trigger.

- [ ] **Step 3: Implement — focus the trigger on close**

In each control, put a ref on the trigger `<button>` and, when transitioning from editing→closed, focus it. The simplest reliable shape is an effect that runs when `editing` flips to false:

```tsx
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) triggerRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
```

Attach `ref={triggerRef}` to the trigger button. This returns focus on every close path (Enter, Escape, outside-click) because they all set `editing` false. Do **not** focus on the initial mount (the `wasEditing` guard prevents that).

- [ ] **Step 4: Run, full suite, commit**

```bash
cd frontend && ./node_modules/.bin/vitest run src/chart/KeyControl.test.tsx src/chart/TempoControl.test.tsx && npm test && npm run build
```

```bash
git add frontend/src/chart/KeyControl.tsx frontend/src/chart/KeyControl.test.tsx frontend/src/chart/TempoControl.tsx frontend/src/chart/TempoControl.test.tsx
git commit -m "fix(a11y): inline key/tempo editors return focus to their trigger

Editing the key or tempo and pressing Enter/Escape unmounted the field and left
focus on document.body, so a keyboard user had to Tab back from the top. Both now
return focus to the trigger button on every close path, the same courtesy Panel
already extends via useReturnFocus.

Watched failing before the fix."
```

---

### Task 6: The findings doc, and the chord-quality-colour decision

The phase's deliverable is the record of what was verified and the reasoned call on the one optional feature.

**Files:**
- Create: `docs/phase-4-audit.md`

- [ ] **Step 1: Write `docs/phase-4-audit.md`**

Record, concisely:
- **Method:** three adversarial passes (contrast, keyboard, screen-reader) + a composited-contrast computation; no committed browser/e2e infra, so the checks are Vitest-encoded where possible and the genuinely browser-only checks are listed for a human.
- **Contrast sweep — the full table** (both themes) of every composited surface with its effective ratio and verdict, the two fixes (spotlight, receded bar), and the **documented-borderline** items not changed: dropzone `opacity: 0.6` *while uploading* (transient; hint 2.56:1; primary CTA is a disabled/exempt button) and `.mode-choice__option span { opacity: 0.85 }` (a subtitle, marginal) — with the rationale that both are transient and supplementary.
- **Keyboard:** the ÷2/×2 fix; the confirmation that focus rings and traps are clean; the note that the transport is DOM-last by design.
- **Screen reader:** the `main` landmark + skip link; the labels; the inline-editor focus return; and the confirmation that the volunteered/answer rule is airtight.
- **Chord-quality colour — DROPPED, with rationale:** the chord's *quality* is already carried by two visible channels — the chord suffix (`Cm`, `C7`, `Cmaj7`, `Cm7`) and the roman-numeral case — so colour would be a third, **redundant** channel. Making it clear WCAG AA in **both** themes for five distinct, mutually-distinguishable qualities requires ~10 new themed tokens, and a five-way hue code is by construction hard for the red-green colourblind users the spec's own hue rule exists to protect. Per the spec's explicit clause — *"the first item to drop if it cannot pass AA contrast in both themes"* — it is dropped. If reintroduced later, it must be a supplementary, contrast-validated, non-text accent, never the sole carrier of quality.
- **Browser-only checks still owed to a human** (jsdom cannot do these): a real screen-reader pass (VoiceOver/NVDA) confirming nothing announces during playback; a visual check that the desaturated practice spotlight still reads as a spotlight in both themes; a keyboard walk on a touch device.

- [ ] **Step 2: Commit**

```bash
git add docs/phase-4-audit.md
git commit -m "docs: Phase 4 accessibility audit and the chord-quality-colour decision

Records the three-pass audit (contrast, keyboard, screen reader), the composited-
contrast sweep with numbers, the fixes made, the borderline items left documented,
and the reasoned drop of chord-quality colour: quality is already carried by the
chord suffix and the roman-numeral case, so colour is redundant, and a five-way
AA-safe two-theme hue code is both token-heavy and hostile to the colourblind users
the hue rule protects. Dropped per the spec's own 'first to drop' clause."
```

---

### Task 7: Close out the phase

- [ ] **Step 1: Whole suite and type-check green**

```bash
cd frontend && npm test && npm run build
```

Report the final total (462 at phase start, plus this phase's tests).

- [ ] **Step 2: Confirm no invariant regressed**

```bash
cd frontend && ./node_modules/.bin/vitest run src/theme/palette.test.ts src/theme/contrastStates.test.ts src/ui/noInlineStyle.test.ts src/theme/motion.test.ts
```

Expected: PASS — tokens AA, composited colours AA, inline-style ban intact, reduced-motion guards intact.

- [ ] **Step 3: Review, then finish the branch**

- **REQUIRED SUB-SKILL:** dispatch the `tabit-reviewer` subagent and address anything it finds.
- Then **REQUIRED SUB-SKILL:** superpowers:finishing-a-development-branch — this is Phase 4 of the already-open PR #29. The commits land on `worktree-design-overhaul-spec`; **do not open a second PR, do not merge, do not force-push.** Rebase on `origin/main` first (`git fetch origin && git rebase origin/main`); resolve any conflicts and say so. Update the PR body: PR #29 now carries all four phases, and the "Deferred to Phase 4" section resolves (chord-quality colour dropped, everything else closed).

---

## Self-Review

**Spec coverage (Phase 4 row + *Accessibility* + chord-quality clause):**
- Full WCAG AA contrast sweep in both themes → Task 1 (harness + the two fixes) + the documented-borderline items in Task 6.
- Keyboard-only walkthrough of all five screens → Task 3 (the one real bug) + the audit's confirmation that the rest is clean, recorded in Task 6.
- Screen-reader pass on practice mode → Task 2 (`main` landmark) + Task 4 (labels) + Task 5 (focus return) + the confirmation that the volunteered/answer rule holds, recorded in Task 6.
- Chord-quality colour "if it passes" → Task 6, dropped with rationale per the spec's clause.
- Accessibility is verified, not retrofitted wholesale — the fixes are the specific failures the audit found.

**Placeholder scan:** none — every code and CSS step shows exact content; the test-name/label adaptations are called out where a file's existing helper must be matched.

**Type/name consistency:** `blend` (Task 1) is defined in `contrast.ts` and consumed by `contrastStates.test.ts`. `#main-content` is the single id shared by `SkipLink` and `App`'s `<main>` (Task 2). `editorRef`/`triggerRef`/`wasEditing` are local to their components. The reduced-motion guard for the spotlight is updated in Task 1 to match the dropped `opacity`.
