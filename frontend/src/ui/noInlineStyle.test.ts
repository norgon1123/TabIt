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
