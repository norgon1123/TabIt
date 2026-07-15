import { render, screen } from "@testing-library/react";
import { test, expect, vi } from "vitest";
import TimeSignatureControl from "./TimeSignatureControl";

test("names its glyph buttons for a screen reader", () => {
  // The glyphs (− + ◀ ▶) announced as "minus, button" / "left-pointing triangle, button"
  // with no hint of which quantity they change. aria-label says what each one does.
  render(
    <TimeSignatureControl beatsPerMeasure={4} measureOffset={1} onChange={vi.fn()} busy={false} />,
  );
  expect(screen.getByRole("button", { name: /more beats per measure/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /fewer beats per measure/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /bar line later/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /bar line earlier/i })).toBeInTheDocument();
});
