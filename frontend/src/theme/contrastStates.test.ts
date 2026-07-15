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

/** The stateful/composited surfaces AA must hold on, over and above the raw token pairs
 *  palette.test.ts checks. `opacity`, `color-mix` and `filter` change the RENDERED colour;
 *  this test computes the effective colour and asserts AA on it. */
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
