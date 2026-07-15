import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import ControlDeck from "./ControlDeck";
import { PlaybackProvider } from "./PlaybackContext";
import type { BeatGridInfo } from "./musicalPosition";

const GRID: BeatGridInfo = {
  beatTimes: [0, 0.5, 1],
  bpm: 120,
  duration: 16,
  beatsPerMeasure: 4,
  measureOffset: 0,
};

const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");

/** Regression guard.
 *
 *  An earlier `@media (max-width: 600px) { .control-deck__extra { display: none } }` deleted
 *  the tempo control, the key control, and the "Where am I?" button from the DOM and the
 *  accessibility tree on a phone — the exact form factor the deck's bottom-pinning was
 *  justified by. "It recedes; it does not vanish" applies here too: the fix is for the deck
 *  to WRAP on a narrow screen, not amputate its contents. */
describe("control deck on a narrow screen", () => {
  it("never sets display:none on .control-deck__extra", () => {
    const rule = /\.control-deck__extra\s*\{([^}]*)\}/g;
    let match: RegExpExecArray | null;
    let found = false;
    while ((match = rule.exec(css))) {
      found = true;
      expect(
        match[1],
        `.control-deck__extra rule hides its contents entirely: ${match[1]}`,
      ).not.toMatch(/display\s*:\s*none/);
    }
    expect(found, "expected at least one .control-deck__extra rule in index.css").toBe(true);
  });

  it("keeps tempo/key content and the on-demand position button in the DOM regardless of viewport", () => {
    // jsdom never evaluates media queries, so this cannot observe the bug by itself — the
    // CSS-text assertion above is what actually guards it. This documents that the deck
    // renders its extras unconditionally; layout at a given width is the CSS's job alone.
    render(
      <PlaybackProvider>
        <ControlDeck grid={GRID}>
          <span>92 BPM</span>
          <button>Where am I?</button>
        </ControlDeck>
      </PlaybackProvider>,
    );
    expect(screen.getByText("92 BPM")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /where am i/i })).toBeInTheDocument();
  });
});
