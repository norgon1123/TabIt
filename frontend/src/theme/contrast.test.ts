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

  // These two greys straddle the AA text threshold on white. Pinning them from both
  // sides is what proves this is the real WCAG formula and not an approximation of it:
  // an implementation that is merely close would put them on the same side.
  it("puts the canonical boundary greys on the correct sides of AA", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(AA_TEXT); // 4.54
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(AA_TEXT);           // 4.48
  });

  it("still clears the lower UI threshold where it fails the text one", () => {
    // 3:1 is the bar for borders, icons and focus rings — a colour can be legal for a
    // control boundary while being illegal for body text. The two thresholds are not
    // interchangeable and the palette test depends on the difference.
    expect(contrastRatio("#777777", "#ffffff")).toBeGreaterThanOrEqual(AA_UI);
  });
});

describe("thresholds", () => {
  it("matches WCAG AA", () => {
    expect(AA_TEXT).toBe(4.5);
    expect(AA_UI).toBe(3);
  });
});
