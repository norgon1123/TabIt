# Visual Redesign — Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tabit's ad-hoc styling with a real design system — tokens, two themes, a self-hosted typeface, and reusable primitives — so that Phases 2–4 have something to retarget.

**Architecture:** CSS custom properties in `index.css` are the single source of truth for every visual value. A `[data-theme]` attribute on `<html>` swaps the palette; `ThemeProvider` owns that attribute. Five primitives (`Button`, `Card`, `Field`, `Panel`, `Stack`) absorb the styling that is currently hand-written at 78 call sites. Contrast is enforced by a **test that parses `index.css` and does the WCAG maths** — so an inaccessible colour cannot land.

**Tech Stack:** React 18 + TypeScript + Vite. Vitest (jsdom) + Testing Library + MSW. No CSS framework — plain CSS with custom properties. `@fontsource-variable/figtree` for the self-hosted typeface.

**Spec:** `docs/superpowers/specs/2026-07-13-visual-redesign-design.md`

## Global Constraints

- **This phase changes appearance, not structure.** No layout restructuring, no moving controls, no new components beyond the primitives. At the end, the app looks warmer and is structurally identical. Layout changes are Phase 2.
- **Inline `style={{...}}` is permitted for runtime-computed geometry ONLY** — a flex ratio derived from a beat count, a transform driven by the playhead, a measured pixel offset. It is **forbidden** for colour, spacing, radius, border, shadow, font, or static layout. This is the real rule; the spec's scope bullet says "eliminate all 78", which overstates it — the spec's *Definition of done* has it right. **Fix that spec bullet as part of Task 1.**
- **WCAG AA in both themes:** 4.5:1 for text, 3:1 for UI and graphical objects.
- **Hue is never the only channel.** Any meaning carried by colour carries a second channel.
- **`prefers-reduced-motion` is already honoured** (`index.css:114`). Do not regress it.
- **Token names:** keep the existing ones that work (`--bg`, `--text`, `--muted`, `--accent`, `--line`, `--bar-line`, `--danger`, `--ok`). Rename **`--panel` → `--surface`** (5 usages). Do not rename anything else — `Timeline.test.tsx:69-75` asserts on `var(--bar-line)` by name.
- **Definition of done, per `CLAUDE.md`:** `cd frontend && npm test` passes and `cd frontend && npm run build` passes (`tsc -b`). Every task ends green.
- **Commit after every task.**

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `frontend/src/theme/contrast.ts` | WCAG relative-luminance and contrast-ratio maths. Pure functions, no React. |
| `frontend/src/theme/contrast.test.ts` | Unit tests for the maths against known-good values. |
| `frontend/src/theme/palette.test.ts` | **The enforcement test.** Parses `index.css`, asserts AA for every pair, in both themes. |
| `frontend/src/theme/ThemeContext.tsx` | `ThemeProvider` + `useTheme`. Owns `data-theme` on `<html>`, persists to `localStorage`, defaults to `prefers-color-scheme`. |
| `frontend/src/theme/ThemeContext.test.tsx` | Tests default/persist/toggle. |
| `frontend/src/components/ThemeToggle.tsx` | The user-facing switch. Lives in `Header`. |
| `frontend/src/components/ThemeToggle.test.tsx` | |
| `frontend/src/ui/Stack.tsx` | The workhorse. Replaces the `display:flex; gap:N; alignItems:center` row copied into 5+ files. |
| `frontend/src/ui/Button.tsx` | Wraps `<button>`, variants `default \| primary \| danger \| icon`. |
| `frontend/src/ui/Card.tsx` | Wraps the `.card` class as a component. |
| `frontend/src/ui/Field.tsx` | `<label>` + control + optional error. Matches the existing `SegmentEditor` pattern. |
| `frontend/src/ui/Panel.tsx` | `.card .chart-panel` — the anchored side panel. Keeps its positioning **this phase**; Phase 2 docks it. |
| `frontend/src/ui/*.test.tsx` | One colocated test per primitive. |
| `frontend/src/ui/noInlineStyle.test.ts` | **The guard.** Fails if a static inline style reappears anywhere. |

**Modify:**

| File | Change |
|---|---|
| `frontend/src/index.css` | Rewrite `:root`. Full token set, both themes, `color-scheme`, `@font-face` via Fontsource. |
| `frontend/src/main.tsx:7` | Import Figtree; wrap app in `ThemeProvider`. |
| `frontend/package.json` | Add `@fontsource-variable/figtree`. |
| 17 component files | Migrate static inline styles to primitives/tokens. Tasks 7–12. |
| `frontend/src/chart/Timeline.test.tsx:69-75` | Update the bar-line assertions (Task 11). |
| `docs/superpowers/specs/...-design.md` | Fix the overstated "eliminate all 78" scope bullet (Task 1). |

**Do NOT touch this phase:** `chordProgress.ts` (the GPU-transition scheme — Phase 3 builds on it), the drag-resize handles (out of scope entirely), `ScrubBar.tsx`'s commented-out state (Phase 2 revives it), and the absolutely-positioned panel mechanism (Phase 2).

---

### Task 1: Contrast maths

The palette cannot be trusted without this, so it comes first. Pure functions — the easiest possible TDD.

**Files:**
- Create: `frontend/src/theme/contrast.ts`
- Test: `frontend/src/theme/contrast.test.ts`
- Modify: `docs/superpowers/specs/2026-07-13-visual-redesign-design.md`

**Interfaces:**
- Produces: `relativeLuminance(hex: string): number`, `contrastRatio(a: string, b: string): number`, `AA_TEXT = 4.5`, `AA_UI = 3`. Task 2 consumes all four.

- [ ] **Step 1: Write the failing test**

`frontend/src/theme/contrast.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { relativeLuminance, contrastRatio, AA_TEXT, AA_UI } from "./contrast";

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("accepts shorthand hex", () => {
    expect(relativeLuminance("#fff")).toBeCloseTo(1, 5);
  });
});

describe("contrastRatio", () => {
  // The two anchors every WCAG implementation is checked against.
  it("is 21:1 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
  });

  it("is 1:1 for a colour against itself", () => {
    expect(contrastRatio("#4f8cff", "#4f8cff")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#14161a", "#e6e8ec")).toBeCloseTo(
      contrastRatio("#e6e8ec", "#14161a"),
      5,
    );
  });

  // These two greys straddle the AA text threshold on white: #767676 is 4.54:1 and
  // #777777 is 4.48:1. Pinning them from BOTH sides is what proves this is the real
  // WCAG formula and not an approximation of it — an implementation that is merely
  // close would put them on the same side.
  it("puts the canonical boundary greys on the correct sides of AA", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(AA_TEXT);
  });

  it("still clears the lower UI threshold where it fails the text one", () => {
    // 3:1 is the bar for borders, icons and focus rings — a colour can be legal for a
    // control boundary while being illegal for body text. The two thresholds are not
    // interchangeable, and the whole --line / --control-border split depends on the
    // difference being real.
    expect(contrastRatio("#777777", "#ffffff")).toBeGreaterThanOrEqual(AA_UI);
  });
});

describe("thresholds", () => {
  it("matches WCAG AA", () => {
    expect(AA_TEXT).toBe(4.5);
    expect(AA_UI).toBe(3);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend && npx vitest run src/theme/contrast.test.ts
```

Expected: FAIL — `Failed to resolve import "./contrast"`.

- [ ] **Step 3: Implement**

`frontend/src/theme/contrast.ts`:

```ts
/** WCAG 2.1 contrast maths. Pure — no DOM, no React.
 *
 *  Used by palette.test.ts to enforce that no inaccessible colour pair can land in
 *  index.css. The thresholds are the AA ones: text needs 4.5:1, and UI/graphical
 *  objects (borders, icons, focus rings, the bar lines on the chart) need 3:1.
 *  Dark themes are where this bites — a "tasteful muted grey" is usually ~2.8:1. */

/** AA minimum for body text. */
export const AA_TEXT = 4.5;
/** AA minimum for UI components and graphical objects. */
export const AA_UI = 3;

function parseHex(hex: string): [number, number, number] {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Not a hex colour: ${hex}`);
  }
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** sRGB channel → linear light. The 0.03928 kink is from the WCAG spec, not a tweak. */
function linearise(channel8Bit: number): number {
  const c = channel8Bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(linearise);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours, 1 (identical) to 21 (black on white). Symmetric. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd frontend && npx vitest run src/theme/contrast.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Fix the overstated spec bullet**

In `docs/superpowers/specs/2026-07-13-visual-redesign-design.md`, under **Scope → In scope**, replace the bullet beginning "Elimination of all 78 inline `style={{...}}` objects" with:

```markdown
- Elimination of every inline `style={{...}}` object **carrying colour, spacing, radius,
  border, shadow, font, or static layout** — this is the load-bearing wall. A
  `style={{ background: "#26303f" }}` cannot respond to a theme. Under a single-theme
  redesign this was optional; under two themes it is not.

  **Inline style remains legitimate for runtime-computed geometry**, and those uses stay:
  `Timeline.tsx:174` sets `flex: ${beats} 1 0` from the chord's beat count, and
  `Timeline.tsx:220` / `ScrubBar.tsx:102` carry the playhead transform that
  `chordProgress.ts` drives. Those are data, not design values.
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/theme/contrast.ts frontend/src/theme/contrast.test.ts docs/superpowers/specs/2026-07-13-visual-redesign-design.md
git commit -m "feat(theme): WCAG contrast maths, so the palette can be enforced not eyeballed

Also corrects the spec's scope bullet: inline style is legitimate for
runtime-computed geometry (the beat-derived flex ratio, the playhead
transform). It is the *static* values — colour, spacing, layout — that
cannot survive a theme switch."
```

---

### Task 2: The palette, enforced

The warm two-theme palette, with a test that makes an inaccessible colour a **build failure** rather than a code-review opinion.

**Files:**
- Modify: `frontend/src/index.css:1-30`
- Test: `frontend/src/theme/palette.test.ts`

**Interfaces:**
- Consumes: `contrastRatio`, `AA_TEXT`, `AA_UI` from Task 1.
- Produces: CSS custom properties consumed by every later task. `--surface` **replaces `--panel`**.

- [ ] **Step 1: Write the failing test**

`frontend/src/theme/palette.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { contrastRatio, AA_TEXT, AA_UI } from "./contrast";

/** Parse the custom properties out of one CSS block by selector.
 *  Reading the stylesheet as text (rather than duplicating the values in TS) keeps
 *  index.css the single source of truth — the test cannot drift from what ships. */
function tokensFor(css: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!block) throw new Error(`No CSS block for selector: ${selector}`);
  const out: Record<string, string> = {};
  for (const [, name, value] of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
const THEMES = {
  light: tokensFor(css, ':root, [data-theme="light"]'),
  dark: tokensFor(css, '[data-theme="dark"]'),
};

/** [foreground, background, threshold, why]
 *
 *  NOTE ON WHAT IS *NOT* HERE. `--line` is absent deliberately, and this is the one
 *  judgement call in the palette worth understanding.
 *
 *  WCAG 1.4.11 governs two things: the boundaries of UI *components* (the thing that tells
 *  you "this is an input"), and *graphical objects* that carry meaning. `--line` is neither
 *  — it is the hairline around a card and between two chords in the same bar. A card is a
 *  decorative grouping, not a control, and a chord is identified by its own label. Forcing
 *  3:1 on it would turn every card into a heavy grey box.
 *
 *  So the old `--line` was doing two jobs at once and doing one of them badly. It is split:
 *
 *    --line            decorative hairline. Not WCAG-governed. Kept perceptible (~1.85:1)
 *                      because a card differs from the page by only 1.05:1 — the border and
 *                      the shadow are what make a card visible at all, not its fill.
 *    --control-border  the boundary of an input, select or button. A real UI component
 *                      boundary. MUST clear 3:1, and is tested below.
 *    --bar-line        the measure rule on the chart. A graphical object that says "a bar
 *                      starts here". MUST clear 3:1, and must out-weigh --line. */
const PAIRS: Array<[string, string, number, string]> = [
  ["--text", "--bg", AA_TEXT, "body text on the page"],
  ["--text", "--surface", AA_TEXT, "text on a card"],
  ["--muted", "--bg", AA_TEXT, "secondary text on the page"],
  ["--muted", "--surface", AA_TEXT, "secondary text on a card"],
  ["--accent", "--bg", AA_UI, "the accent as a border/focus ring on the page"],
  ["--accent", "--surface", AA_UI, "the accent as a border on a card"],
  ["--danger", "--bg", AA_TEXT, "error text"],
  ["--danger", "--surface", AA_TEXT, "error text on a card"],
  ["--ok", "--bg", AA_TEXT, "success text"],
  ["--ok", "--surface", AA_TEXT, "success text on a card"],
  ["--on-accent", "--accent", AA_TEXT, "label on a primary button"],
  ["--control-border", "--bg", AA_UI, "an input's boundary — a UI component"],
  ["--control-border", "--surface", AA_UI, "an input's boundary, on a card"],
  ["--bar-line", "--bg", AA_UI, "the measure rule — a graphical object"],
  ["--bar-line", "--surface", AA_UI, "the measure rule, on a card"],
];

describe.each(Object.entries(THEMES))("%s theme", (themeName, tokens) => {
  it.each(PAIRS)("%s on %s meets %s:1 — %s", (fg, bg, threshold, _why) => {
    const ratio = contrastRatio(tokens[fg], tokens[bg]);
    expect(
      ratio,
      `${themeName}: ${fg} (${tokens[fg]}) on ${bg} (${tokens[bg]}) is ${ratio.toFixed(2)}:1, needs ${threshold}:1`,
    ).toBeGreaterThanOrEqual(threshold);
  });

  it("defines every token the other theme defines", () => {
    const other = themeName === "light" ? THEMES.dark : THEMES.light;
    expect(Object.keys(tokens).sort()).toEqual(Object.keys(other).sort());
  });

  it("makes the measure rule out-weigh the ordinary chord divider", () => {
    // Two channels, not one: the bar line is heavier than --line by COLOUR (this test)
    // and by WIDTH (3px vs 2px, in the CSS). A user who cannot see the colour difference
    // still sees the weight difference. Hue is never the only channel.
    const bar = contrastRatio(tokens["--bar-line"], tokens["--bg"]);
    const line = contrastRatio(tokens["--line"], tokens["--bg"]);
    expect(bar).toBeGreaterThan(line);
  });

  it("keeps the decorative hairline perceptible even though WCAG does not govern it", () => {
    // A card differs from the page by only ~1.05:1, so the border and the shadow are what
    // make a card visible at all. A hairline at 1.4:1 is not doing that job. This is not a
    // WCAG threshold — it is a floor we set ourselves, and it is why --line was split from
    // --control-border rather than simply darkened.
    expect(contrastRatio(tokens["--line"], tokens["--bg"])).toBeGreaterThanOrEqual(1.6);
  });

  it("has no leftover --panel token (renamed to --surface)", () => {
    expect(tokens["--panel"]).toBeUndefined();
    expect(tokens["--surface"]).toBeDefined();
  });
});

describe("the stylesheet itself", () => {
  it("declares color-scheme so native controls follow the theme", () => {
    // Without this, the native <audio> element and form widgets render light against a
    // dark UI. It is one line and it is the cheapest a11y win in the codebase.
    expect(css).toMatch(/color-scheme:\s*light\b/);
    expect(css).toMatch(/color-scheme:\s*dark\b/);
  });

  it("has no hardcoded hex outside the token blocks", () => {
    // Every colour must be a var(). #2c313a is currently written literally 5 times.
    const withoutTokenBlocks = css.replace(/(:root, \[data-theme="light"\]|\[data-theme="dark"\])\s*\{[^}]*\}/g, "");
    const strays = withoutTokenBlocks.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(strays, `hardcoded colours outside the palette: ${strays.join(", ")}`).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend && npx vitest run src/theme/palette.test.ts
```

Expected: FAIL — `No CSS block for selector: :root, [data-theme="light"]`. The current `index.css` has a bare `:root` and no themes at all.

- [ ] **Step 3: Rewrite the token block**

Replace `frontend/src/index.css:1-15` (the `:root` block) with the following. **Leave lines 16 onward alone for now** — Task 3 handles the rest of the stylesheet.

```css
/* ---- Tokens -------------------------------------------------------------------------
   The single source of truth for every visual value in Tabit. Nothing below this block,
   and nothing in a component, may hardcode a colour, a space, a radius or a size.

   Two themes, ONE design. Light is warm paper; dark is warm charcoal. They are the same
   app in different light — not two personalities behind a switch. Both are deliberately
   warm: the old #14161a was blue-cold DAW chrome, which told a beginner "this tool is not
   for you."

   Theme is about the room the user is in. Mode (chart vs practice) is about what the app
   is doing. They are orthogonal — practice mode must NOT be "the dark theme".

   Every pair here is contrast-tested at WCAG AA by theme/palette.test.ts. If you change a
   colour, that test tells you whether you are allowed to. */

   Three tokens do the job the old `--line` was doing alone, because it was doing two jobs
   and one of them badly:

     --line            decorative hairline — a card's edge, the divider between two chords
                       in the same bar. NOT WCAG-governed (a card is not a control, and a
                       chord is identified by its label). But kept perceptible at ~1.85:1,
                       because a card differs from the page by only 1.05:1 — the border and
                       the shadow are what make a card visible at all, not its fill.
     --control-border  the boundary of an input, select or button. A real UI component
                       boundary, so WCAG 1.4.11 applies: 3:1, enforced.
     --bar-line        the measure rule on the chart. A graphical object that says "a bar
                       starts here": 3:1, enforced, and heavier than --line by BOTH colour
                       and width. Two channels, never hue alone.

   Every value below has been checked — all 30 governed pairs clear AA in both themes. */

:root, [data-theme="light"] {
  color-scheme: light;

  --bg: #fdf9f3;              /* warm paper, not sterile #ffffff */
  --surface: #ffffff;         /* a card, raised off the paper */
  --text: #1f1b16;            /* warm ink                          16.3:1 on bg */
  --muted: #635a50;           /*                                    6.4:1 on bg */
  --line: #c4b8a6;            /* decorative hairline                1.9:1 — see above */
  --control-border: #958b7e;  /* input/button boundary              3.2:1 on bg, 3.4:1 on surface */
  --bar-line: #7d7060;        /* the measure rule                   4.6:1 on bg */
  --accent: #b8480f;          /* "now / active". Nothing else may borrow it.  5.0:1 on bg */
  --on-accent: #ffffff;       /* label on an accent fill            5.3:1 on accent */
  --danger: #b3261e;          /*                                    6.2:1 on bg */
  --ok: #1c7a52;              /*                                    5.1:1 on bg */
}

[data-theme="dark"] {
  color-scheme: dark;

  --bg: #1a1714;              /* warm charcoal — brown-black, NOT the old blue-black */
  --surface: #232019;
  --text: #f2ede4;            /*                                   15.3:1 on bg */
  --muted: #a89d8d;           /*                                    6.7:1 on bg */
  --line: #4a443b;            /* decorative hairline                1.9:1 */
  --control-border: #787063;  /* input/button boundary              3.7:1 on bg, 3.3:1 on surface */
  --bar-line: #9c9280;        /* the measure rule                   5.8:1 on bg */
  --accent: #ff9d4d;          /*                                    8.7:1 on bg */
  --on-accent: #241505;       /*                                    8.6:1 on accent */
  --danger: #ff8a80;          /*                                    7.8:1 on bg */
  --ok: #5fd39b;              /*                                    9.6:1 on bg */
}

:root {
  /* ---- Space. A 4px base. Nothing in the app may invent a gap. ---- */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  /* ---- Radius ---- */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* ---- Type. Figtree is variable, so the weight range is free. ---- */
  --font-ui: "Figtree Variable", system-ui, -apple-system, sans-serif;
  --font-display: var(--font-ui);
  --font-chart: var(--font-ui);

  --text-xs: 0.78rem;
  --text-sm: 0.88rem;
  --text-md: 1rem;
  --text-lg: 1.25rem;
  --text-xl: 1.6rem;
  --text-2xl: 2.1rem;

  --leading-tight: 1.2;
  --leading-normal: 1.5;

  --weight-normal: 400;
  --weight-medium: 550;
  --weight-bold: 700;

  /* ---- Shadow ---- */
  --shadow-panel: 0 8px 24px rgb(0 0 0 / 18%);

  /* ---- Chart geometry ----
     The chord cell is sized from a TOKEN, never from its content. A content-sized cell
     re-wraps the whole chart the day someone swaps the typeface for a wider one — this
     token means a font change can alter the chart's texture but never its layout.
     Wide enough for the longest label the app can produce (e.g. "F#m7"). */
  --chord-cell-min: 4.5rem;

  font-family: var(--font-ui);
  font-size: 16px;
  line-height: var(--leading-normal);
}

[data-theme="dark"] {
  --shadow-panel: 0 8px 24px rgb(0 0 0 / 45%);
}
```

- [ ] **Step 4: Replace every hardcoded colour in the rest of `index.css`**

The `no hardcoded hex` test will still fail until this is done. Fix all five leaks — and note
that **the right replacement differs by what the border is doing**:

- `index.css:19` (`button`) — `border: 1px solid #2c313a` → `var(--control-border)` *(a control)*
- `index.css:21` (`button.primary`) — `color: #fff` → `var(--on-accent)`
- `index.css:25` (`input, select`) — `border: 1px solid #2c313a` → `var(--control-border)` *(a control)*
- `index.css:27` (`.card`) — `border: 1px solid #2c313a` → `var(--line)` *(decorative)*
- `index.css:47` (`.chart-panel`) — `box-shadow: 0 8px 24px rgb(0 0 0 / 45%)` → `var(--shadow-panel)`

And rename the `--panel` references (`index.css:20, 24, 27, 72, 74`) to `var(--surface)`.

- [ ] **Step 5: Run it and watch it pass**

```bash
cd frontend && npx vitest run src/theme/palette.test.ts
```

Expected: PASS — 26 contrast assertions (13 pairs × 2 themes), plus the token-parity, `--panel`-is-gone, `color-scheme` and stray-hex checks.

**If a contrast assertion fails,** the failure message names the pair and the exact ratio. Darken the foreground or lighten the background until it passes — do **not** loosen the threshold. That is the entire point of this test.

- [ ] **Step 6: Verify nothing else broke**

```bash
cd frontend && npm test && npm run build
```

Expected: full suite PASS, build PASS. (`--panel` no longer exists, so a missed rename shows up as an unstyled element, not a test failure — if anything looks wrong, grep for `--panel`.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/index.css frontend/src/theme/palette.test.ts
git commit -m "feat(theme): warm two-theme palette, enforced by a contrast test

Light is warm paper, dark is warm charcoal. Both replace the blue-cold
#14161a, which read as DAW chrome to an audience of beginners.

The palette is contrast-tested at WCAG AA in both themes by parsing
index.css directly, so an inaccessible colour is a failing build rather
than something a reviewer has to catch by eye. Dark themes are exactly
where this slips: a tasteful muted grey is usually about 2.8:1.

--panel is renamed --surface. color-scheme is declared, so the native
<audio> element stops rendering light against a dark UI."
```

---

### Task 3: Figtree, self-hosted

**Files:**
- Modify: `frontend/package.json`, `frontend/src/main.tsx:7`, `frontend/src/index.css`
- Test: `frontend/src/theme/palette.test.ts` (extend)

**Interfaces:**
- Consumes: `--font-ui` from Task 2.
- Produces: nothing new — this is the typeface landing behind the token that already points at it.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/theme/palette.test.ts`:

```ts
describe("typography", () => {
  it("points --font-ui at Figtree with a system fallback", () => {
    const root = tokensFor(css, ":root");
    expect(root["--font-ui"]).toMatch(/Figtree/);
    // The fallback matters: the page must be readable in the frame before the font loads.
    expect(root["--font-ui"]).toMatch(/system-ui/);
  });

  it("has a type scale rather than magic numbers", () => {
    const root = tokensFor(css, ":root");
    for (const t of ["--text-xs", "--text-sm", "--text-md", "--text-lg", "--text-xl", "--text-2xl"]) {
      expect(root[t], `missing type token ${t}`).toBeDefined();
    }
  });

  it("sizes chord cells from a token, not from their content", () => {
    // A content-sized cell re-wraps the entire chart the day the typeface changes.
    expect(tokensFor(css, ":root")["--chord-cell-min"]).toBeDefined();
  });

  it("declares no font-family outside the font tokens", () => {
    const declarations = css.match(/font-family:\s*([^;]+);/g) ?? [];
    for (const d of declarations) {
      expect(d, `font-family must reference a token: ${d}`).toMatch(/var\(--font-/);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend && npx vitest run src/theme/palette.test.ts -t typography
```

Expected: FAIL — `--font-ui` does not match `/Figtree/` yet (Task 2 wrote the token but the `:root` block regex will match the *first* `:root`, which is the palette block). If the `tokensFor(css, ":root")` call resolves to the palette block rather than the scale block, that is the failure to fix in Step 3 by ensuring the selectors are distinct.

**Note for the implementer:** `tokensFor` matches the *first* block whose selector matches. Task 2 wrote `:root, [data-theme="light"]` and a separate bare `:root`. The regex for `":root"` is escaped and anchored to the literal selector text, so `:root, [data-theme="light"]` will **not** match a search for `:root` — but verify this. If it does match, change the scale block's selector to `:root` and the palette block's to `[data-theme="light"], :root` so they are unambiguous, and adjust the test's selector strings to match exactly what is in the file.

- [ ] **Step 3: Install the font**

Fontsource ships fonts as npm packages — self-hosted, bundled by Vite, no Google CDN request at runtime, and no licence to track. Figtree Variable is a single file carrying weights 300–900.

```bash
cd frontend && npm install @fontsource-variable/figtree
```

- [ ] **Step 4: Import it**

`frontend/src/main.tsx` — add above the existing `import "./index.css";` on line 7:

```ts
import "@fontsource-variable/figtree";
import "./index.css";
```

Order matters: the font's `@font-face` must be registered before the stylesheet that uses it.

- [ ] **Step 5: Run the tests and watch them pass**

```bash
cd frontend && npx vitest run src/theme/palette.test.ts
```

Expected: PASS.

- [ ] **Step 6: Verify the build bundles the font**

```bash
cd frontend && npm run build && ls dist/assets/ | grep -i figtree
```

Expected: build PASS, and at least one `figtree-*.woff2` in `dist/assets/`. **If no woff2 appears, the font is not being bundled** — check that the import in `main.tsx` is present and that Vite is not tree-shaking it.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/main.tsx frontend/src/theme/palette.test.ts
git commit -m "feat(theme): self-host Figtree with a real type scale

Typography was the biggest unpulled lever: one line of system-ui and no
scale at all, with sizes as magic numbers inline. Nothing says 'nobody
designed this' faster.

Self-hosted via Fontsource rather than the Google CDN — no third-party
request, and swapping the typeface later is replacing a package rather
than editing a URL. Figtree is variable, so 300-900 ships in one file.

Chord cells are sized from --chord-cell-min, never from their content:
a content-sized cell would re-wrap the whole chart the day someone
swapped in a wider face."
```

---

### Task 4: Theme provider and toggle

**Files:**
- Create: `frontend/src/theme/ThemeContext.tsx`, `frontend/src/theme/ThemeContext.test.tsx`
- Create: `frontend/src/components/ThemeToggle.tsx`, `frontend/src/components/ThemeToggle.test.tsx`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Produces:
  - `type Theme = "light" | "dark"`
  - `ThemeProvider({ children }: { children: ReactNode }): JSX.Element`
  - `useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }`
  - `ThemeToggle(): JSX.Element` — Task 7 puts it in `Header`.
  - Storage key: `"tabit.theme"`.

- [ ] **Step 1: Write the failing test**

`frontend/src/theme/ThemeContext.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "./ThemeContext";

/** jsdom has no matchMedia. Fake it so we can drive the OS preference. */
function mockPrefersDark(prefersDark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: query.includes("dark") ? prefersDark : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  );
}

function Probe() {
  const { theme, toggle } = useTheme();
  return (
    <>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggle}>flip</button>
    </>
  );
}

function renderProbe() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to the OS preference when the user has never chosen", () => {
    mockPrefersDark(true);
    renderProbe();
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });

  it("defaults to light when the OS prefers light", () => {
    mockPrefersDark(false);
    renderProbe();
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
  });

  it("prefers the user's stored choice over the OS preference", () => {
    // The whole point of the toggle: the user overrules the OS, and it sticks.
    mockPrefersDark(true);
    localStorage.setItem("tabit.theme", "light");
    renderProbe();
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
  });

  it("writes data-theme onto <html> so the CSS can see it", () => {
    mockPrefersDark(false);
    renderProbe();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("persists a toggle and updates <html>", async () => {
    mockPrefersDark(false);
    renderProbe();
    await userEvent.click(screen.getByRole("button", { name: "flip" }));

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("tabit.theme")).toBe("dark");
  });

  it("ignores a corrupt stored value rather than crashing", () => {
    mockPrefersDark(true);
    localStorage.setItem("tabit.theme", "chartreuse");
    renderProbe();
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });
});
```

`frontend/src/components/ThemeToggle.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../theme/ThemeContext";
import ThemeToggle from "./ThemeToggle";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {},
    onchange: null, dispatchEvent: () => false,
  }));
});

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe("ThemeToggle", () => {
  it("announces which theme it will switch TO, not which is active", () => {
    // "Dark mode" as a label is ambiguous to a screen reader — is it a state or an action?
    // The accessible name must say what pressing it does.
    renderToggle();
    expect(screen.getByRole("button", { name: /switch to dark/i })).toBeInTheDocument();
  });

  it("flips the theme and re-labels itself", async () => {
    renderToggle();
    await userEvent.click(screen.getByRole("button", { name: /switch to dark/i }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: /switch to light/i })).toBeInTheDocument();
  });

  it("does not rely on the icon alone to convey its purpose", () => {
    // Hue is never the only channel — and neither is a glyph. The button needs a name.
    renderToggle();
    const btn = screen.getByRole("button", { name: /switch to/i });
    expect(btn).toHaveAccessibleName();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd frontend && npx vitest run src/theme/ThemeContext.test.tsx src/components/ThemeToggle.test.tsx
```

Expected: FAIL — `Failed to resolve import "./ThemeContext"`.

- [ ] **Step 3: Implement the provider**

`frontend/src/theme/ThemeContext.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "tabit.theme";

interface ThemeValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/** The user's saved choice, or the OS preference if they have never chosen.
 *
 *  Theme is about the room the user is in — a bright living room on Saturday, a dark
 *  bedroom at midnight — so the OS preference is a good *default* but never a rule. A
 *  stored choice always wins.
 *
 *  Read once, synchronously, at first render: a flash of the wrong theme is worse than a
 *  frame of nothing. */
function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // Private browsing, or storage disabled. Fall through to the OS preference.
  }
  const prefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  // The attribute on <html> is what the CSS keys off. Everything else here exists to
  // decide its value.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable — the theme still applies for this session.
    }
  }, []);

  const toggle = useCallback(() => {
    setThemeState((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // As above.
      }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside a ThemeProvider");
  return value;
}
```

- [ ] **Step 4: Implement the toggle**

`frontend/src/components/ThemeToggle.tsx`:

```tsx
import { useTheme } from "../theme/ThemeContext";
import Button from "../ui/Button";

/** The label says what pressing the button DOES, not what the current state IS.
 *  "Dark mode" is ambiguous read aloud — a screen-reader user cannot tell whether it is
 *  reporting a state or offering an action. The glyph is decorative and hidden from the
 *  accessibility tree; the name carries the meaning. */
export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <Button variant="icon" onClick={toggle} aria-label={`Switch to ${next} mode`}>
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
    </Button>
  );
}
```

**Note:** this imports `Button` from Task 5. If you are executing tasks strictly in order, either land Task 5 first or temporarily use a bare `<button className="icon">` and swap it in Task 7. **Recommended: reorder so Task 5 (primitives) lands before this step.** The plan's task numbering is a reading order, not a hard dependency order — the only hard rule is that a task ends with a green suite.

- [ ] **Step 5: Wrap the app**

`frontend/src/main.tsx` — wrap `<App />`:

```tsx
import "@fontsource-variable/figtree";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ThemeProvider } from "./theme/ThemeContext";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
```

- [ ] **Step 6: Run the tests and watch them pass**

```bash
cd frontend && npx vitest run src/theme/ src/components/ThemeToggle.test.tsx
```

Expected: PASS, 9 tests.

- [ ] **Step 7: Full suite**

```bash
cd frontend && npm test && npm run build
```

Expected: PASS. **Existing tests that render components without `ThemeProvider` will still pass** — `useTheme` is only called by `ThemeToggle`, and nothing else consumes the context. If a test fails with "useTheme must be used inside a ThemeProvider", that test renders `Header` (Task 7) and needs the provider added to its wrapper.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/theme/ThemeContext.tsx frontend/src/theme/ThemeContext.test.tsx frontend/src/components/ThemeToggle.tsx frontend/src/components/ThemeToggle.test.tsx frontend/src/main.tsx
git commit -m "feat(theme): user-toggleable light/dark, defaulting to the OS

Theme is about the room the user is in: a bright living room on Saturday,
a dark bedroom at midnight. A practice tool gets used in both, and only
the user knows which they are in — so the OS preference is a default,
never a rule, and a stored choice always wins.

The toggle's accessible name says what pressing it DOES ('Switch to dark
mode') rather than what the state IS ('Dark mode'), which is ambiguous
read aloud. The glyph is aria-hidden; the name carries the meaning."
```

---

### Task 5: Primitives — `Stack` and `Button`

`Stack` is the workhorse: the row `display:flex; gap:12; alignItems:center; flexWrap:wrap` is hand-copied into at least five files, and it accounts for most of the 78.

**Files:**
- Create: `frontend/src/ui/Stack.tsx`, `frontend/src/ui/Stack.test.tsx`
- Create: `frontend/src/ui/Button.tsx`, `frontend/src/ui/Button.test.tsx`
- Modify: `frontend/src/index.css` (append the `.stack` and refine the `button` rules)

**Interfaces:**
- Produces:
  - `type Space = 1 | 2 | 3 | 4 | 5 | 6` — maps to `--space-N`.
  - `Stack(props: StackProps): JSX.Element`, where
    `StackProps extends HTMLAttributes<HTMLDivElement>` and adds
    `direction?: "row" | "column"` (default `"row"`),
    `gap?: Space` (default `3`),
    `align?: "start" | "center" | "baseline" | "stretch"` (default `"center"`),
    `justify?: "start" | "center" | "between"` (default `"start"`),
    `wrap?: boolean` (default `false`),
    `as?: "div" | "nav" | "header" | "section"` (default `"div"`).
  - `type ButtonVariant = "default" | "primary" | "danger" | "icon"`.
  - `Button(props: ButtonProps): JSX.Element`, where
    `ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>` and adds
    `variant?: ButtonVariant` (default `"default"`).
- Tasks 6–12 consume both.

- [ ] **Step 1: Write the failing tests**

`frontend/src/ui/Stack.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Stack from "./Stack";

describe("Stack", () => {
  it("renders its children", () => {
    render(<Stack><span>hello</span></Stack>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("carries its spacing as data attributes, not inline styles", () => {
    // The whole point: a Stack must be themeable and restyleable from CSS. If it wrote
    // gap:12px inline, Phase 2 could not retarget it and a theme could not touch it.
    const { container } = render(<Stack gap={4} direction="column" />);
    const el = container.firstElementChild!;

    expect(el).toHaveClass("stack");
    expect(el.getAttribute("data-gap")).toBe("4");
    expect(el.getAttribute("data-direction")).toBe("column");
    expect(el.getAttribute("style")).toBeNull();
  });

  it("defaults to a centred, non-wrapping row with gap 3", () => {
    const { container } = render(<Stack />);
    const el = container.firstElementChild!;

    expect(el.getAttribute("data-direction")).toBe("row");
    expect(el.getAttribute("data-gap")).toBe("3");
    expect(el.getAttribute("data-align")).toBe("center");
    expect(el.getAttribute("data-wrap")).toBeNull();
  });

  it("marks wrapping only when asked", () => {
    const { container } = render(<Stack wrap />);
    expect(container.firstElementChild!.getAttribute("data-wrap")).toBe("true");
  });

  it("renders as a semantic element when asked", () => {
    // Header's nav is a <nav>. A Stack must not force everything to be a <div>.
    render(<Stack as="nav" aria-label="Main" />);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("passes through arbitrary props", () => {
    render(<Stack data-testid="s" className="extra" />);
    expect(screen.getByTestId("s")).toHaveClass("stack", "extra");
  });
});
```

`frontend/src/ui/Button.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Button from "./Button";

describe("Button", () => {
  it("is a real button element", () => {
    // Load-bearing for the whole a11y story: a div with onClick is not focusable,
    // not keyboard-activatable, and invisible to a screen reader.
    render(<Button>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" }).tagName).toBe("BUTTON");
  });

  it("defaults to type=button so it cannot accidentally submit a form", () => {
    // The default HTML type is "submit". Inside the login form, a stray button would
    // submit it. This has bitten every codebase that ever shipped a form.
    render(<Button>Go</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("still allows an explicit submit", () => {
    render(<Button type="submit">Log in</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("applies its variant as a class, not an inline style", () => {
    render(<Button variant="primary">Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("primary");
    expect(screen.getByRole("button").getAttribute("style")).toBeNull();
  });

  it("supports the danger and icon variants", () => {
    const { rerender } = render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole("button")).toHaveClass("danger");

    rerender(<Button variant="icon" aria-label="Close">x</Button>);
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass("icon");
  });

  it("does not fire when disabled", async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("fires on Enter, because it is a real button", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    screen.getByRole("button").focus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd frontend && npx vitest run src/ui/
```

Expected: FAIL — `Failed to resolve import "./Stack"`.

- [ ] **Step 3: Implement `Stack`**

`frontend/src/ui/Stack.tsx`:

```tsx
import type { HTMLAttributes } from "react";

/** One of the six space tokens. Nothing may invent a gap. */
export type Space = 1 | 2 | 3 | 4 | 5 | 6;

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  direction?: "row" | "column";
  gap?: Space;
  align?: "start" | "center" | "baseline" | "stretch";
  justify?: "start" | "center" | "between";
  wrap?: boolean;
  as?: "div" | "nav" | "header" | "section";
}

/** The flex row/column, once.
 *
 *  `display:flex; gap:12; alignItems:center; flexWrap:wrap` was hand-written in at least
 *  five files before this existed. Spacing travels as DATA ATTRIBUTES, not inline styles,
 *  so the CSS keeps ownership of the actual pixel values — which is what lets a theme (and
 *  Phase 2's layout work) retarget a Stack without touching a single component. */
export default function Stack({
  direction = "row",
  gap = 3,
  align = "center",
  justify = "start",
  wrap = false,
  as: Tag = "div",
  className,
  ...rest
}: StackProps) {
  return (
    <Tag
      className={className ? `stack ${className}` : "stack"}
      data-direction={direction}
      data-gap={String(gap)}
      data-align={align}
      data-justify={justify}
      data-wrap={wrap ? "true" : undefined}
      {...rest}
    />
  );
}
```

- [ ] **Step 4: Implement `Button`**

`frontend/src/ui/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "default" | "primary" | "danger" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** Every button in Tabit.
 *
 *  Two things are built in HERE so that no call site has to remember them:
 *
 *  1. `type="button"` by default. HTML's default is "submit", which means a stray button
 *     inside the login form submits it. Opt into "submit" explicitly.
 *  2. The variant is a CLASS. An inline style could not respond to a theme, and the
 *     focus-visible ring is defined once in CSS rather than 20 times in JSX. */
export default function Button({
  variant = "default",
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  const classes = [variant === "default" ? null : variant, className]
    .filter(Boolean)
    .join(" ");

  return <button type={type} className={classes || undefined} {...rest} />;
}
```

- [ ] **Step 5: Add the `Stack` CSS**

Append to `frontend/src/index.css`:

```css
/* ---- Stack --------------------------------------------------------------------------
   The flex row/column. Components declare INTENT via data attributes; the pixel values
   live here, so a theme or a layout change can retarget every Stack in the app at once. */
.stack { display: flex; }
.stack[data-direction="row"]    { flex-direction: row; }
.stack[data-direction="column"] { flex-direction: column; }

.stack[data-gap="1"] { gap: var(--space-1); }
.stack[data-gap="2"] { gap: var(--space-2); }
.stack[data-gap="3"] { gap: var(--space-3); }
.stack[data-gap="4"] { gap: var(--space-4); }
.stack[data-gap="5"] { gap: var(--space-5); }
.stack[data-gap="6"] { gap: var(--space-6); }

.stack[data-align="start"]    { align-items: flex-start; }
.stack[data-align="center"]   { align-items: center; }
.stack[data-align="baseline"] { align-items: baseline; }
.stack[data-align="stretch"]  { align-items: stretch; }

.stack[data-justify="start"]   { justify-content: flex-start; }
.stack[data-justify="center"]  { justify-content: center; }
.stack[data-justify="between"] { justify-content: space-between; }

.stack[data-wrap="true"] { flex-wrap: wrap; }
```

And replace the existing bare-element `button` rules (`index.css:19-23, 30`) with token-driven ones. **A visible focus ring is not optional** — it is the only way a keyboard user knows where they are:

```css
button {
  font: inherit;
  font-weight: var(--weight-medium);
  cursor: pointer;
  border-radius: var(--radius-md);
  border: 1px solid var(--control-border);   /* a control's boundary — 3:1, not the hairline */
  background: var(--surface);
  color: var(--text);
  padding: var(--space-2) var(--space-3);
}
button.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
button.danger  { background: transparent; border-color: var(--danger); color: var(--danger); }
button.icon    { padding: var(--space-1) var(--space-2); line-height: 1; border-color: transparent; color: var(--muted); background: transparent; }
button:disabled { opacity: 0.5; cursor: default; }

/* Defined once, here, so no call site has to remember it. */
button:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

- [ ] **Step 6: Run the tests and watch them pass**

```bash
cd frontend && npx vitest run src/ui/
```

Expected: PASS, 13 tests.

- [ ] **Step 7: Full suite**

```bash
cd frontend && npm test && npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/ui/Stack.tsx frontend/src/ui/Stack.test.tsx frontend/src/ui/Button.tsx frontend/src/ui/Button.test.tsx frontend/src/index.css
git commit -m "feat(ui): Stack and Button primitives

Stack is the workhorse. 'display:flex; gap:12; alignItems:center' was
hand-copied into five files; it is now one component that declares intent
via data attributes and lets CSS own the pixels — which is precisely what
lets a theme, and Phase 2's layout work, retarget every row at once.

Button bakes in two things no call site should have to remember: type=button
by default (HTML's default is submit, which means a stray button inside the
login form submits it), and a focus-visible ring defined once."
```

---

### Task 6: Primitives — `Card`, `Field`, `Panel`

**Files:**
- Create: `frontend/src/ui/Card.tsx`, `frontend/src/ui/Field.tsx`, `frontend/src/ui/Panel.tsx`
- Create: `frontend/src/ui/Card.test.tsx`, `frontend/src/ui/Field.test.tsx`, `frontend/src/ui/Panel.test.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `Space` from Task 5.
- Produces:
  - `Card(props: CardProps): JSX.Element`, `CardProps extends HTMLAttributes<HTMLDivElement>` adding `padding?: Space` (default `3`).
  - `Field(props: FieldProps): JSX.Element`, where
    `FieldProps = { label: string; children: ReactNode; error?: string; hint?: string }`.
    Renders a `<label>` **wrapping** the control — matching the pattern already in
    `SegmentEditor.tsx:95-116`, so no `htmlFor`/`id` wiring is needed.
  - `Panel(props: PanelProps): JSX.Element`, where
    `PanelProps extends HTMLAttributes<HTMLDivElement>` adding
    `title: string`, `onClose?: () => void`, `top?: number`.
    **`top` stays an inline style this phase** — it is a runtime-measured offset, and
    Phase 2 replaces the whole mechanism with a docked panel. Do not "fix" it here.

- [ ] **Step 1: Write the failing tests**

`frontend/src/ui/Card.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Card from "./Card";

describe("Card", () => {
  it("renders its children inside a .card", () => {
    render(<Card><span>content</span></Card>);
    expect(screen.getByText("content").closest(".card")).toBeInTheDocument();
  });

  it("carries padding as a data attribute, not an inline style", () => {
    const { container } = render(<Card padding={5} />);
    const el = container.firstElementChild!;
    expect(el.getAttribute("data-padding")).toBe("5");
    expect(el.getAttribute("style")).toBeNull();
  });

  it("passes through className and arbitrary props", () => {
    render(<Card className="chart-panel" data-testid="c" />);
    expect(screen.getByTestId("c")).toHaveClass("card", "chart-panel");
  });
});
```

`frontend/src/ui/Field.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Field from "./Field";

describe("Field", () => {
  it("associates the label with the control without needing an id", () => {
    // The <label> wraps the control, which is the pattern already used in SegmentEditor.
    // No htmlFor/id wiring means no chance of a duplicate or missing id.
    render(
      <Field label="Beats">
        <input type="number" defaultValue={4} />
      </Field>,
    );
    expect(screen.getByLabelText("Beats")).toHaveValue(4);
  });

  it("renders an error and links it to the control for a screen reader", () => {
    render(
      <Field label="Root" error="Could not save segment">
        <select><option>C</option></select>
      </Field>,
    );

    const message = screen.getByText("Could not save segment");
    expect(message).toHaveClass("error");
    // role=alert so the failure is announced when it appears, not silently painted red.
    // Colour is never the only channel.
    expect(message).toHaveAttribute("role", "alert");
  });

  it("renders no error node when there is no error", () => {
    render(<Field label="Root"><select><option>C</option></select></Field>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders a hint when given one", () => {
    render(<Field label="Beats" hint="Half-beats allowed"><input /></Field>);
    expect(screen.getByText("Half-beats allowed")).toBeInTheDocument();
  });
});
```

`frontend/src/ui/Panel.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Panel from "./Panel";

describe("Panel", () => {
  it("renders its title and children", () => {
    render(<Panel title="Edit segment"><span>body</span></Panel>);
    expect(screen.getByText("Edit segment")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("names itself for a screen reader", () => {
    // A panel that appears beside the chart needs to announce what it is when focus
    // lands in it, otherwise it is an unlabelled box of controls.
    render(<Panel title="Edit segment" />);
    expect(screen.getByRole("group", { name: "Edit segment" })).toBeInTheDocument();
  });

  it("shows a close button only when it can close", () => {
    const { rerender } = render(<Panel title="Edit segment" />);
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();

    const onClose = vi.fn();
    rerender(<Panel title="Edit segment" onClose={onClose} />);
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("closes when the close button is pressed", async () => {
    const onClose = vi.fn();
    render(<Panel title="Edit segment" onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps `top` as an inline style — it is a measured offset, not a design value", () => {
    // Phase 2 replaces this whole mechanism with a docked panel. Until then the measured
    // pixel offset is legitimate runtime geometry and must stay inline.
    const { container } = render(<Panel title="Edit segment" top={120} />);
    expect((container.firstElementChild as HTMLElement).style.top).toBe("120px");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd frontend && npx vitest run src/ui/Card.test.tsx src/ui/Field.test.tsx src/ui/Panel.test.tsx
```

Expected: FAIL — unresolved imports.

- [ ] **Step 3: Implement `Card`**

`frontend/src/ui/Card.tsx`:

```tsx
import type { HTMLAttributes } from "react";
import type { Space } from "./Stack";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: Space;
}

/** A surface. Padding travels as a data attribute so the CSS keeps the pixels. */
export default function Card({ padding = 3, className, ...rest }: CardProps) {
  return (
    <div
      className={className ? `card ${className}` : "card"}
      data-padding={String(padding)}
      {...rest}
    />
  );
}
```

- [ ] **Step 4: Implement `Field`**

`frontend/src/ui/Field.tsx`:

```tsx
import type { ReactNode } from "react";

export interface FieldProps {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
}

/** A labelled control.
 *
 *  The <label> WRAPS the control rather than pointing at it with htmlFor. That is the
 *  pattern already in SegmentEditor, it needs no id, and an id that is missing or
 *  duplicated is the single most common way a form silently loses its accessible names.
 *
 *  The error is role="alert" so it is announced when it appears. A red border alone is
 *  invisible to a screen reader and ambiguous to a red-green colourblind user — colour is
 *  never the only channel. */
export default function Field({ label, children, error, hint }: FieldProps) {
  return (
    <div className="field">
      <label className="field__label">
        <span className="field__name">{label}</span>
        {children}
      </label>
      {hint && <span className="field__hint muted">{hint}</span>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Implement `Panel`**

`frontend/src/ui/Panel.tsx`:

```tsx
import type { HTMLAttributes, ReactNode } from "react";
import Button from "./Button";

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: string;
  children?: ReactNode;
  onClose?: () => void;
  /** Measured px offset from the top of the chart area, so the panel lines up with the
   *  chord's row. Runtime geometry, not a design value — it stays inline. Phase 2
   *  replaces this whole mechanism with a docked panel; do not try to tokenise it. */
  top?: number;
}

/** The panel that appears beside the chart — the segment editor, the practice guess.
 *
 *  role="group" + aria-label so that when focus lands inside it, a screen reader says
 *  what it is rather than reading out an unlabelled box of selects. */
export default function Panel({ title, children, onClose, top, className, ...rest }: PanelProps) {
  return (
    <div
      role="group"
      aria-label={title}
      className={className ? `card chart-panel ${className}` : "card chart-panel"}
      data-padding="3"
      style={top === undefined ? undefined : { top }}
      {...rest}
    >
      <div className="panel__head">
        <strong>{title}</strong>
        {onClose && (
          <Button variant="icon" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
            <span aria-hidden="true">&times;</span>
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 6: Add the CSS**

Replace the `.card` rule (`index.css:27`) and append the rest:

```css
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
}
.card[data-padding="1"] { padding: var(--space-1); }
.card[data-padding="2"] { padding: var(--space-2); }
.card[data-padding="3"] { padding: var(--space-3); }
.card[data-padding="4"] { padding: var(--space-4); }
.card[data-padding="5"] { padding: var(--space-5); }
.card[data-padding="6"] { padding: var(--space-6); }

.field { display: grid; gap: var(--space-1); }
.field__label { display: grid; gap: var(--space-1); }
.field__name { font-size: var(--text-sm); color: var(--muted); }
.field__hint { font-size: var(--text-xs); }
.field .error { margin: 0; font-size: var(--text-sm); }

.panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
```

- [ ] **Step 7: Run the tests and watch them pass**

```bash
cd frontend && npx vitest run src/ui/
```

Expected: PASS, 25 tests across all five primitives (Stack 6, Button 7, Card 3, Field 4, Panel 5).

- [ ] **Step 8: Full suite and commit**

```bash
cd frontend && npm test && npm run build
```

```bash
git add frontend/src/ui/ frontend/src/index.css
git commit -m "feat(ui): Card, Field and Panel primitives

Field wraps its control in the <label> rather than pointing at it with
htmlFor — no id to go missing or collide, which is the commonest way a
form quietly loses its accessible names. Its error is role=alert, because
a red border is invisible to a screen reader and ambiguous to a red-green
colourblind user.

Panel is role=group with a name, so focus landing inside it announces what
it is instead of an unlabelled box of selects. Its measured `top` offset
stays inline: that is runtime geometry, not a design value, and Phase 2
replaces the mechanism wholesale."
```

---

### Task 7: Migrate the chrome — `Header`, `Spinner`, `AnalysisStatusBadge`

The first migration. Small, and it proves the primitives work before touching the chart.

**Files:**
- Modify: `frontend/src/components/Header.tsx` (5 inline styles → 0)
- Modify: `frontend/src/components/Spinner.tsx` (1 → 0)
- Modify: `frontend/src/components/AnalysisStatusBadge.tsx` (4 → 0)
- Modify: any existing test that renders `Header` (add `ThemeProvider`)
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `Stack`, `Button` (Task 5), `ThemeToggle` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/Header.test.tsx` if it does not exist; otherwise add these cases:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../theme/ThemeContext";
import Header from "./Header";

// Header now renders ThemeToggle, which needs the provider.
function renderHeader() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <Header />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("Header", () => {
  it("offers the theme toggle", () => {
    renderHeader();
    expect(screen.getByRole("button", { name: /switch to/i })).toBeInTheDocument();
  });

  it("has no inline styles left", () => {
    const { container } = renderHeader();
    const styled = container.querySelectorAll("[style]");
    expect(
      Array.from(styled).map((e) => e.outerHTML.slice(0, 80)),
      "Header must carry no inline styles — they cannot respond to a theme",
    ).toEqual([]);
  });

  it("marks its nav as a landmark", () => {
    renderHeader();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });
});
```

**Note:** `Header` calls `useAuth`. If `AuthContext` requires a provider even when logged out, wrap in `AuthProvider` too and add MSW handlers — follow whatever pattern the existing page tests use (check `pages/LoginPage.test.tsx` or `App.test.tsx` for the established wrapper).

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend && npx vitest run src/components/Header.test.tsx
```

Expected: FAIL — no theme toggle, and the inline-style assertion reports five styled elements.

- [ ] **Step 3: Rewrite `Header`**

`frontend/src/components/Header.tsx`:

```tsx
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Stack from "../ui/Stack";
import Button from "../ui/Button";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate("/"); // logged out, "/" is the guest page — no reason to bounce them to a form
  }

  return (
    <header className="app-header">
      <Stack className="container" justify="between" gap={3}>
        <Link to="/" className="wordmark">Tabit</Link>
        <Stack as="nav" aria-label="Main" gap={3}>
          {user ? (
            <>
              <Link to="/">Library</Link>
              <span className="muted">{user.username}</span>
              <Button onClick={onLogout}>Log out</Button>
            </>
          ) : (
            <>
              <Link to="/login">Log in</Link>
              <Link to="/register">Sign up</Link>
            </>
          )}
          <ThemeToggle />
        </Stack>
      </Stack>
    </header>
  );
}
```

- [ ] **Step 4: Rewrite `Spinner` and `AnalysisStatusBadge`**

Read each file, then move every static value to CSS. For `Spinner`, the rotation `@keyframes tabit-spin` already lives in CSS — only the sizing/border needs moving. For `AnalysisStatusBadge`, the status colour must **not** be the only channel: it already renders status *text*, so keep the text and make the colour supplementary via a class (`.status--failed` etc.), never an inline colour.

Add to `frontend/src/index.css`:

```css
.app-header { border-bottom: 1px solid var(--line); }
.app-header .container { padding-top: var(--space-3); padding-bottom: var(--space-3); }
.wordmark {
  font-family: var(--font-display);
  font-weight: var(--weight-bold);
  font-size: var(--text-lg);
  text-decoration: none;
  color: var(--text);
}

.spinner {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 2px solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: tabit-spin 0.7s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .spinner { animation-duration: 2s; }
}

/* Status colour is SUPPLEMENTARY. The badge always renders the status word, so a
   colourblind user loses nothing. Never let the hue be the only channel. */
.status--pending { color: var(--muted); }
.status--running { color: var(--accent); }
.status--done    { color: var(--ok); }
.status--failed  { color: var(--danger); }
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
cd frontend && npx vitest run src/components/
```

Expected: PASS.

- [ ] **Step 6: Full suite and commit**

```bash
cd frontend && npm test && npm run build
```

```bash
git add frontend/src/components/ frontend/src/index.css
git commit -m "refactor(ui): migrate the chrome to primitives; add the theme toggle

Header, Spinner and AnalysisStatusBadge carry no inline styles now.

The status badge's colour is explicitly supplementary — it always renders
the status word, so a colourblind user loses nothing when the hue does
not land. Hue is never the only channel."
```

---

### Task 8: Migrate the auth pages — `LoginPage`, `RegisterPage`

Small, self-contained, and they exercise `Field` and `Button type="submit"` properly.

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx` (3 → 0), `frontend/src/pages/RegisterPage.tsx` (3 → 0)
- Modify: their colocated tests if they exist

**Interfaces:**
- Consumes: `Stack`, `Button`, `Card`, `Field`.

- [ ] **Step 1: Write the failing test**

Add to (or create) `frontend/src/pages/LoginPage.test.tsx`:

```tsx
it("has no inline styles left", () => {
  const { container } = renderLoginPage(); // reuse the file's existing render helper
  expect(Array.from(container.querySelectorAll("[style]"))).toEqual([]);
});

it("labels every input", () => {
  renderLoginPage();
  expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
});

it("submits with a real submit button", () => {
  // Button defaults to type=button. The login form's submit MUST opt in explicitly,
  // or pressing Enter in the password field does nothing.
  renderLoginPage();
  expect(screen.getByRole("button", { name: /log in/i })).toHaveAttribute("type", "submit");
});
```

Mirror the same three cases in `RegisterPage.test.tsx`.

- [ ] **Step 2: Run and watch fail**

```bash
cd frontend && npx vitest run src/pages/LoginPage.test.tsx src/pages/RegisterPage.test.tsx
```

Expected: FAIL on the inline-style and `type=submit` assertions.

- [ ] **Step 3: Migrate both pages**

Read each file. Replace the inline-styled wrappers with `Card` + `Stack direction="column"`, each input with `Field`, and the submit with `<Button type="submit" variant="primary">`.

**The `type="submit"` is the bug this task fixes**, not just a refactor: `Button` defaults to `type="button"`, so an unmarked submit button would silently stop the form working. The test above is what catches it.

- [ ] **Step 4: Run, then full suite**

```bash
cd frontend && npx vitest run src/pages/ && npm test && npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx frontend/src/pages/RegisterPage.tsx frontend/src/pages/LoginPage.test.tsx frontend/src/pages/RegisterPage.test.tsx
git commit -m "refactor(ui): migrate the auth pages to Card/Field/Button

Every input is now labelled through Field, and the submit buttons opt into
type=submit explicitly — Button defaults to type=button, so an unmarked one
would have quietly broken Enter-to-submit."
```

---

### Task 9: Migrate the library — `LibraryPage`, `UploadDropzone`

`LibraryPage` is the joint-largest offender (11 inline styles).

**Files:**
- Modify: `frontend/src/pages/LibraryPage.tsx` (11 → 0)
- Modify: `frontend/src/library/UploadDropzone.tsx` (4 → 0)
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Write the failing test**

Add to the existing `LibraryPage` test file:

```tsx
it("has no inline styles left", () => {
  const { container } = renderLibraryPage();
  expect(Array.from(container.querySelectorAll("[style]"))).toEqual([]);
});
```

And to the `UploadDropzone` test file:

```tsx
it("has no inline styles left", () => {
  const { container } = renderDropzone();
  expect(Array.from(container.querySelectorAll("[style]"))).toEqual([]);
});

it("is reachable and operable from the keyboard", () => {
  // A drag-and-drop region that only responds to drag is unusable without a mouse.
  // The "Choose a file" button is the keyboard path and must be a real button.
  renderDropzone();
  expect(screen.getByRole("button", { name: /choose a file/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and watch fail**

```bash
cd frontend && npx vitest run src/pages/LibraryPage src/library/
```

- [ ] **Step 3: Migrate**

Read both files. Replace every inline style with `Stack` / `Card` / `Button`. `UploadDropzone`'s dashed border and its `rgba(255,255,255,0.03)` hover fill (`UploadDropzone.tsx:55,59`) become CSS — note that a hardcoded white overlay is **wrong in the light theme** and must become a token-driven fill:

```css
.dropzone {
  /* An interactive region, so its boundary is a control boundary: --control-border, not
     the decorative hairline. The dashed edge IS the affordance — it must be visible. */
  border: 2px dashed var(--control-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  text-align: center;
  background: transparent;
}
.dropzone[data-dragging="true"] {
  border-color: var(--accent);
  background: var(--surface);
}
```

- [ ] **Step 4: Run, full suite, commit**

```bash
cd frontend && npm test && npm run build
```

```bash
git add frontend/src/pages/LibraryPage.tsx frontend/src/library/ frontend/src/index.css
git commit -m "refactor(ui): migrate the library to primitives

UploadDropzone's drag highlight was rgba(255,255,255,0.03) — a white
overlay, which is invisible on warm paper. It is now token-driven and
works in both themes."
```

---

### Task 10: Migrate the chart controls

`TempoControl`, `KeyControl`, `TransposeControl`, `TimeSignatureControl`, `SegmentEditor`.

**Files:**
- Modify: `frontend/src/chart/TransposeControl.tsx` (1 → 0)
- Modify: `frontend/src/chart/TimeSignatureControl.tsx` (2 → 0)
- Modify: `frontend/src/chart/SegmentEditor.tsx` (3 → 0)
- `TempoControl` and `KeyControl` have **zero** inline styles already — they only need their `.inline-edit` CSS retokenised (already done in Task 2). Verify, do not rewrite.

- [ ] **Step 1: Write the failing test**

Add to `SegmentEditor.test.tsx`:

```tsx
it("has no inline styles left", () => {
  const { container } = renderSegmentEditor();
  expect(Array.from(container.querySelectorAll("[style]"))).toEqual([]);
});

it("still lets a keyboard user resize a segment via the Beats field", () => {
  // This is load-bearing. Drag-to-resize is out of scope and may be cut from the app;
  // the Beats field is the ONLY guaranteed path to the same behaviour, and it routes
  // through the same redistributeLength() call. If this breaks, keyboard users lose
  // segment resizing entirely.
  renderSegmentEditor();
  const beats = screen.getByLabelText(/beats/i);
  expect(beats).toHaveAttribute("step", "0.5"); // the half-beat snap rule
  expect(beats).toHaveAttribute("min", "0.5");
});
```

- [ ] **Step 2: Run and watch fail**

```bash
cd frontend && npx vitest run src/chart/SegmentEditor.test.tsx
```

- [ ] **Step 3: Migrate `SegmentEditor`**

Replace `SegmentEditor.tsx:85-123`'s hand-rolled markup with the primitives. The `top` prop passes straight through to `Panel`:

```tsx
  return (
    <Panel title="Edit segment" onClose={onClose} top={top} className="segment-editor">
      <Stack direction="column" gap={2} align="stretch">
        <Field label="Root">
          <select value={root} onChange={(e) => setRoot(e.target.value)}>
            {ROOTS.map((r) => (<option key={r} value={r}>{r}</option>))}
          </select>
        </Field>
        <Field label="Quality">
          <select value={quality} onChange={(e) => setQuality(e.target.value)}>
            {QUALITIES.map((q) => (<option key={q} value={q}>{QUALITY_LABELS[q]}</option>))}
          </select>
        </Field>
        <Field label="Beats" error={error ?? undefined}>
          <input
            type="number"
            step="0.5"
            min="0.5"
            value={beats}
            onChange={(e) => changeBeats(Number(e.target.value))}
          />
        </Field>
        <Stack gap={2} align="stretch">
          <Button variant="primary" onClick={saveChord} disabled={busy}>Save</Button>
          <Button variant="danger" onClick={onDelete} disabled={busy}>Delete</Button>
        </Stack>
      </Stack>
    </Panel>
  );
```

Note the `error` moved onto the Beats `Field` so it is announced via `role="alert"` and associated with a control, rather than floating as a bare `<p className="error">`.

**Keep `changeBeats`, `saveChord`, and every `useEffect` in `SegmentEditor.tsx:34-83` exactly as they are.** This task is markup only. The re-seeding comment at lines 40-44 documents a real bug that was fixed once — do not disturb it.

- [ ] **Step 4: Migrate `TransposeControl` and `TimeSignatureControl`**

Read both; replace their inline flex rows with `Stack` and their buttons with `Button`.

- [ ] **Step 5: Run, full suite, commit**

```bash
cd frontend && npm test && npm run build
```

```bash
git add frontend/src/chart/SegmentEditor.tsx frontend/src/chart/TransposeControl.tsx frontend/src/chart/TimeSignatureControl.tsx frontend/src/chart/SegmentEditor.test.tsx
git commit -m "refactor(ui): migrate the chart controls to primitives

SegmentEditor's save error now lives on the Beats field, so it is announced
via role=alert and tied to a control instead of floating as a bare red <p>.

Locked in a test for the Beats field's step=0.5/min=0.5: with drag-to-resize
out of scope (and possibly cut), that field is the only guaranteed path to
resizing a segment, and it is what makes the drag scope-cut safe for keyboard
users."
```

---

### Task 11: Migrate the chart core — `ChartSheet`, `Timeline`

The riskiest task. **`Timeline` is where the runtime-geometry exception lives** — read the Global Constraints again before starting.

**Files:**
- Modify: `frontend/src/chart/ChartSheet.tsx` (11 → 0)
- Modify: `frontend/src/chart/Timeline.tsx` (6 → 2, deliberately)
- Modify: `frontend/src/chart/Timeline.test.tsx:69-75` — **the assertions that must change**
- Modify: `frontend/src/index.css`

**The two inline styles that MUST survive in `Timeline.tsx`:**

| Line | Style | Why it stays |
|---|---|---|
| `:174` | `flex: \`${beats} 1 0\`` | The cell's width **is** the chord's beat count. Data, not design. |
| `:220` | the progress-fill transform | Driven per-frame by `chordProgress.ts`. Its tests (`chordProgress.test.ts:20-58`) protect the GPU-transition scheme, which Phase 3 builds on. **Do not touch it.** |

Everything else in `Timeline` — the flex column at `:126`, the row at `:128`, the `#26303f` active background at `:189`, the bar-line borders, the drag-handle positioning at `:198`/`:212` — moves to CSS.

- [ ] **Step 1: Update the tests that this task deliberately breaks**

`Timeline.test.tsx:69-75` currently asserts:

```ts
expect(cellStyle("s2")).toContain("border-left: 3px solid var(--bar-line)");
expect(cellStyle("s1")).toContain("border-left: 2px solid var(--accent)");
expect(cellStyle("s1")).not.toContain("var(--bar-line)");
```

This hardcodes border widths **and token names** into an assertion on the raw `style` attribute. Once the borders move to CSS, there is no inline style to read.

Replace those assertions with ones that test the **behaviour** — that a measure-start cell is *marked* as one — rather than the pixel value:

```ts
it("marks the cell that starts a measure, so the bar line can be drawn", () => {
  // The bar line is a graphical object and gets its 3:1 contrast from --bar-line, which
  // palette.test.ts enforces. What THIS test cares about is that the right cell is
  // marked — not how many pixels wide the rule is, which is a design decision the CSS
  // is allowed to change without breaking the suite.
  renderTimeline();
  expect(cell("s2")).toHaveAttribute("data-bar-start", "true");
  expect(cell("s1")).not.toHaveAttribute("data-bar-start");
});

it("marks the selected cell", () => {
  renderTimeline({ selectedId: "s1" });
  expect(cell("s1")).toHaveAttribute("data-selected", "true");
});
```

Adapt `cell()` from the existing `cellStyle()` helper — it should return the element rather than its style string.

**Leave `Timeline.test.tsx:61` and `:89-120` alone.** Those assert on `style.transform` and `style.transition` — they test the *animation logic*, not appearance, and they are the guard rail protecting the scheme Phase 3 builds on.

- [ ] **Step 2: Run and watch the new assertions fail**

```bash
cd frontend && npx vitest run src/chart/Timeline.test.tsx
```

Expected: FAIL — `data-bar-start` does not exist yet.

- [ ] **Step 3: Migrate `Timeline`**

Read `Timeline.tsx:126-235`. The cell becomes:

```tsx
              <button
                type="button"
                key={s.id}
                className="chord-cell"
                data-bar-start={isBarStart ? "true" : undefined}
                data-selected={selected ? "true" : undefined}
                data-playing={isActive ? "true" : undefined}
                data-masked={masked ? "true" : undefined}
                onClick={() => onSelect(s.id)}
                style={{
                  // Runtime geometry ONLY: the cell's width IS the chord's beat count.
                  // Every other visual value on this element lives in CSS.
                  flex: `${beats} 1 0`,
                }}
              >
                {/* ... existing children, unchanged ... */}
              </button>
```

**Note the element changed from a `<div>` to a `<button>`.** This is required by the spec (chord cells must be real focusable buttons) and it is the condition that makes the drag-to-resize scope cut safe — it is how a keyboard user reaches the segment editor at all. If the existing element already has an `onClick`, this is a strict improvement with no behaviour change.

Preserve the existing `className` logic at `:145` if it carries anything the data attributes do not.

- [ ] **Step 4: Add the chart CSS**

```css
.chord-cell {
  position: relative;
  min-width: var(--chord-cell-min);   /* sized from a token, never from content */
  font-family: var(--font-chart);
  font-variant-numeric: tabular-nums;
  background: transparent;
  border: 1px solid transparent;
  border-left: 2px solid var(--line);
  border-radius: 0;
  padding: var(--space-2);
  text-align: center;
  color: var(--text);
}
/* The measure rule. Heavier than --line by BOTH colour and width — two channels, so it
   still reads as "a bar starts here" without relying on hue. */
.chord-cell[data-bar-start="true"] { border-left: 3px solid var(--bar-line); }
.chord-cell[data-selected="true"]  { border-left-color: var(--accent); }

/* "Playing" gets colour AND a border. Phase 3 adds the scale bump — the third channel.
   The old #26303f background was one channel, and a subtle one at that. */
.chord-cell[data-playing="true"] {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border-color: var(--accent);
}

.chord-cell[data-masked="true"] strong { color: var(--muted); }
.chord-cell[data-masked="true"]:hover strong { color: var(--text); }

.chart-line { display: flex; justify-content: flex-start; gap: 0; }
.chart-lines { display: flex; flex-direction: column; gap: var(--space-1); }
```

Delete the now-superseded `.chord-cell--masked` rules at `index.css:90-91`.

- [ ] **Step 5: Migrate `ChartSheet`**

Read `ChartSheet.tsx`. Replace all 11 inline styles with `Stack` / `Card`. **Do not touch:**
- The panel-offset measurement at `:76-87` (Phase 2 replaces the mechanism).
- The commented-out `ScrubBar` at `:7` and `:159-167` (Phase 2 revives it).

- [ ] **Step 6: Run and watch pass**

```bash
cd frontend && npx vitest run src/chart/
```

Expected: PASS — including `chordProgress.test.ts` and the transform assertions in `Timeline.test.tsx`, **untouched**. If `chordProgress.test.ts` fails, you have broken the transition scheme; revert and re-read the constraint.

- [ ] **Step 7: Full suite and commit**

```bash
cd frontend && npm test && npm run build
```

```bash
git add frontend/src/chart/ChartSheet.tsx frontend/src/chart/Timeline.tsx frontend/src/chart/Timeline.test.tsx frontend/src/index.css
git commit -m "refactor(ui): migrate the chart to tokens; chord cells become real buttons

Chord cells were divs with onClick — unfocusable, not keyboard-operable,
invisible to a screen reader. They are <button>s now, which is what makes
the drag-to-resize scope cut safe: it is how a keyboard user reaches the
segment editor at all.

Two inline styles survive in Timeline, deliberately: the flex ratio (the
cell's width IS the chord's beat count) and the progress transform (driven
per-frame by chordProgress.ts). Those are data, not design values.

Timeline's bar-line test asserted 'border-left: 3px solid var(--bar-line)'
against the raw style attribute — hardcoding both the pixel width and the
token name. It now asserts the cell is MARKED as a measure start, leaving
the CSS free to decide how heavy the rule is. The measure rule still reads
as heavier by two channels (colour and width), not hue alone."
```

---

### Task 12: Migrate practice and the remaining pages

`ChordGuess`, `ModeChoice`, `GuestHomePage`, `ChartEditorPage`.

**Files:**
- Modify: `frontend/src/practice/ChordGuess.tsx` (8 → 0)
- Modify: `frontend/src/practice/ModeChoice.tsx` (4 → 0)
- Modify: `frontend/src/pages/GuestHomePage.tsx` (5 → 0)
- Modify: `frontend/src/pages/ChartEditorPage.tsx` (3 → 0)

**Do NOT rename these classes:** `chord-guess`, `chord-guess--wrong`, `chord-guess--right`, `shake`. `ChordGuess.test.tsx:47-51` and `ChartEditorPage.practice.test.tsx:97` assert on them, and **Phase 3 is what changes this feedback** (fixing the one-channel "correct" state). Renaming them here would break those tests for no benefit and burn the Phase 3 budget early.

**Do NOT touch `ChartEditorPage.tsx:43`'s `← Library` link or the title row** beyond removing inline styles — Phase 2 restructures that page.

- [ ] **Step 1: Write the failing test**

Add the standard assertion to each of the four components' test files:

```tsx
it("has no inline styles left", () => {
  const { container } = renderIt(); // reuse each file's existing render helper
  expect(Array.from(container.querySelectorAll("[style]"))).toEqual([]);
});
```

- [ ] **Step 2: Run and watch fail**

```bash
cd frontend && npx vitest run src/practice/ src/pages/GuestHomePage src/pages/ChartEditorPage
```

- [ ] **Step 3: Migrate all four**

Read each; replace inline styles with `Stack` / `Card` / `Button` / `Field` / `Panel`. `ChordGuess` becomes a `Panel` (it is already `card chart-panel`), keeping its `chord-guess` class so the existing feedback CSS and tests still apply.

- [ ] **Step 4: Run, full suite, commit**

```bash
cd frontend && npm test && npm run build
```

```bash
git add frontend/src/practice/ frontend/src/pages/GuestHomePage.tsx frontend/src/pages/ChartEditorPage.tsx
git commit -m "refactor(ui): migrate practice mode and the remaining pages

The chord-guess feedback classes are deliberately unchanged: Phase 3 is
what fixes the one-channel 'correct' state (green with no second channel,
ambiguous to a red-green colourblind user). Renaming them now would break
two tests for no benefit."
```

---

### Task 13: The guard — lock the rule in

Without this, the 78 inline styles come back one PR at a time.

**Files:**
- Create: `frontend/src/ui/noInlineStyle.test.ts`

- [ ] **Step 1: Write the test**

`frontend/src/ui/noInlineStyle.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "node:fs";

/** The rule, enforced.
 *
 *  Inline style is permitted for RUNTIME-COMPUTED GEOMETRY only — a flex ratio derived
 *  from a beat count, a transform driven by the playhead, a measured pixel offset. It is
 *  forbidden for colour, spacing, radius, border, shadow, font, or static layout, because
 *  a style={{ background: "#26303f" }} cannot respond to a theme.
 *
 *  This is the wall that keeps the design system standing. Each entry below is a
 *  deliberate exception with a reason. Adding one requires justifying it here. */
const ALLOWED: Record<string, string> = {
  "src/chart/Timeline.tsx":
    "flex ratio from the chord's beat count; the playhead progress transform (chordProgress.ts)",
  "src/chart/ScrubBar.tsx":
    "scrub fill and knob positions, computed from playback time",
  "src/chart/ChartSheet.tsx":
    "the measured px offset that aligns the panel with the chord's row (Phase 2 removes this)",
  "src/ui/Panel.tsx":
    "receives that measured offset as its `top` prop (Phase 2 removes this)",
};

/** Properties that are NEVER acceptable inline, even in an allowed file. */
const BANNED = [
  "background", "backgroundColor", "color", "border", "borderColor", "borderRadius",
  "boxShadow", "padding", "margin", "gap", "fontSize", "fontFamily", "fontWeight",
  "display", "flexDirection", "alignItems", "justifyContent", "flexWrap",
];

const SRC = resolve(__dirname, "..");

function sourceFiles(): string[] {
  return globSync("**/*.tsx", { cwd: SRC })
    .filter((f) => !f.endsWith(".test.tsx"))
    .map((f) => f.replace(/\\/g, "/"));
}

describe("no static inline styles", () => {
  it("finds source files to check (guards against a broken glob)", () => {
    // Without this, a glob that matches nothing makes every assertion below pass
    // vacuously — the test would go green while enforcing nothing at all.
    expect(sourceFiles().length).toBeGreaterThan(15);
  });

  it.each(sourceFiles())("%s", (file) => {
    const source = readFileSync(resolve(SRC, file), "utf8");
    const key = `src/${file}`;

    if (!source.includes("style={{") && !source.includes("style={")) return;

    expect(
      ALLOWED[key],
      `${key} uses an inline style but is not on the allow-list.\n` +
        `Inline style is for runtime-computed geometry only — never colour, spacing, or layout.\n` +
        `Use a token, a class, or a primitive (Stack/Button/Card/Field/Panel).\n` +
        `If this really is runtime geometry, add it to ALLOWED in this file with a reason.`,
    ).toBeDefined();
  });

  it.each(sourceFiles())("%s uses no banned property inline", (file) => {
    const source = readFileSync(resolve(SRC, file), "utf8");
    // Look only inside style={{ ... }} blocks.
    for (const [, block] of source.matchAll(/style=\{\{([^}]*)\}\}/g)) {
      for (const prop of BANNED) {
        expect(
          block.includes(`${prop}:`),
          `src/${file} sets "${prop}" in an inline style. That value cannot respond to a ` +
            `theme. Move it to index.css or a primitive.`,
        ).toBe(false);
      }
    }
  });
});
```

**Note on `globSync`:** if `node:fs`'s `globSync` is unavailable in this Node version, use `fast-glob` (already transitively present via Vite) or fall back to a small recursive `readdirSync` walk. **Do not skip the "finds source files" assertion** — a glob that silently matches nothing turns this whole test into a no-op that reports green.

- [ ] **Step 2: Run it**

```bash
cd frontend && npx vitest run src/ui/noInlineStyle.test.ts
```

Expected: PASS. If it fails, a component still carries a static inline style — the failure message names the file and the property. Go fix it; do not add it to `ALLOWED` unless it is genuinely runtime geometry.

- [ ] **Step 3: Full suite, build, commit**

```bash
cd frontend && npm test && npm run build
```

```bash
git add frontend/src/ui/noInlineStyle.test.ts
git commit -m "test(ui): fail the build if a static inline style comes back

78 inline style objects took one PR at a time to accumulate. Without a
guard they return the same way.

Inline style stays legal for runtime-computed geometry — the beat-derived
flex ratio, the playhead transform, the measured panel offset — and each
exception is on an allow-list with a reason. Everything else is a failure
with a message naming the file and the property."
```

---

### Task 14: Close the phase — verify by driving the app

Tests do not tell you whether it *looks* right. This one is done by hand.

- [ ] **Step 1: Run the whole suite and the build**

```bash
cd frontend && npm test && npm run build
```

Expected: all green.

- [ ] **Step 2: Drive the app in both themes**

```bash
# terminal 1
uvicorn app.main:app --reload
# terminal 2
cd frontend && npm run dev
```

Open http://localhost:5173 and walk **every screen in both themes**: guest home, register, login, library, chart editor (chart mode **and** practice mode).

Check:
- [ ] Nothing is unstyled or invisible — a missed `--panel` rename shows up as a transparent element, not a test failure.
- [ ] The native `<audio>` control matches the theme (this is what `color-scheme` buys).
- [ ] The theme survives a page reload.
- [ ] Playback still highlights the current chord, and the progress fill still animates.
- [ ] Selecting a chord still opens the editor beside its row.

- [ ] **Step 3: Keyboard-only pass**

Put the mouse away. `Tab` through every screen.

- [ ] Every control is reachable, and the focus ring is **visible** in both themes.
- [ ] Chord cells are focusable and `Enter` opens the segment editor. *(This is the condition that makes the drag-to-resize scope cut safe — if it fails, the cut is not safe and Phase 1 is not done.)*
- [ ] The Beats field resizes a segment with arrow keys.
- [ ] No focus trap anywhere.

- [ ] **Step 4: Confirm the phase's own claim**

The app should look **warmer and properly typeset, but structurally identical.** If anything has *moved*, that is Phase 2 leaking in — revert it.

- [ ] **Step 5: Commit anything outstanding, then open the PR**

```bash
git add -A && git commit -m "chore: phase 1 verification pass"
git push -u origin <branch>
gh pr create --draft --title "Redesign Phase 1: design-system foundation" --body "..."
```

---

## Self-Review

**Spec coverage** — every Phase 1 item in the spec's delivery table maps to a task:

| Spec requirement | Task |
|---|---|
| Token layer (colour, space, radius, type, shadow, font) | 2, 3 |
| Light + dark palette, warm, AA-contrast-validated | 2 |
| `color-scheme` declared | 2 |
| Self-hosted Figtree + type scale | 3 |
| Chord cells sized from a token, not content | 3 (`--chord-cell-min`), 11 (applied) |
| Theme toggle: user-controlled, OS default, persisted | 4 |
| Primitives with a11y built in once | 5, 6 |
| Eliminate static inline styles (17 files, 78 objects) | 7–12, guarded by 13 |
| `--panel` → `--surface` | 2 |
| Chord cells become real focusable buttons | 11 |
| Keep `prefers-reduced-motion` | 7 (spinner), verified in 14 |
| No layout restructuring | Constraint on every task; verified in 14 Step 4 |

**Deliberately deferred, and named as such in the tasks:** the docked panel and the `ScrubBar` revival (Phase 2), the current-chord scale bump and the reveal-as-reward (Phase 3), chord-quality colour and the full audit (Phase 4).

**Known ordering wrinkle:** Task 4's `ThemeToggle` imports `Button` from Task 5. Land Task 5 before Task 4's Step 4, or stub with a bare `<button className="icon">` and swap it in Task 7. Called out in Task 4, Step 4.
