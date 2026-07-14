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
