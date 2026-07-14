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
