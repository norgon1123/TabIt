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
