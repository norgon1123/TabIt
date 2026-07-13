import { isCorrectGuess } from "./answer";
import type { SegmentOut } from "../api/types";

function segment(root: string, quality: string): SegmentOut {
  return {
    id: "s1",
    start_beat: 0,
    end_beat: 4,
    start_time: 0,
    end_time: 2,
    chord_root: root,
    chord_quality: quality,
    roman_numeral: "I",
  };
}

test("the chord itself is correct", () => {
  expect(isCorrectGuess({ root: "C", quality: "maj" }, segment("C", "maj"))).toBe(true);
});

// The player pressed the right key; the chart just spells it the other way. Failing them
// here would be teaching them something false.
test("an enharmonic root is correct — C# names the chart's Db", () => {
  expect(isCorrectGuess({ root: "C#", quality: "min" }, segment("Db", "min"))).toBe(true);
  expect(isCorrectGuess({ root: "Bb", quality: "maj" }, segment("A#", "maj"))).toBe(true);
});

test("the wrong root is wrong", () => {
  expect(isCorrectGuess({ root: "D", quality: "maj" }, segment("C", "maj"))).toBe(false);
});

// Hearing the seventh is the point of the exercise, so quality is exact — no partial credit.
test("the right root with the wrong quality is wrong", () => {
  expect(isCorrectGuess({ root: "G", quality: "maj" }, segment("G", "dom7"))).toBe(false);
  expect(isCorrectGuess({ root: "A", quality: "min" }, segment("A", "min7"))).toBe(false);
});

test("a root that names no note is wrong, not a crash", () => {
  expect(isCorrectGuess({ root: "H", quality: "maj" }, segment("C", "maj"))).toBe(false);
});
