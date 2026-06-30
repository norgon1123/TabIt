import { describe, expect, test } from "vitest";
import { boundaryUpdates, groupIntoLines, redistributeLength } from "./chartLayout";
import { roundCs, formatTimeCs, clampBoundary } from "./timeMath";

const seg = (b: number) => ({ start_beat: 0, end_beat: b });

describe("groupIntoLines (beat-aware)", () => {
  test("wraps segments into whole-measure lines by beat count", () => {
    // beatsPerLine = 8 (e.g. 2 measures of 4). Three 4-beat chords -> [2,1].
    const lines = groupIntoLines([seg(4), seg(4), seg(4)], 8);
    expect(lines.map((l) => l.length)).toEqual([2, 1]);
  });
  test("empty input yields no lines", () => {
    expect(groupIntoLines([], 4)).toEqual([]);
  });
  test("a chord longer than beatsPerLine gets its own line", () => {
    const longChord = { start_beat: 0, end_beat: 16 };
    const short = { start_beat: 0, end_beat: 4 };
    const lines = groupIntoLines([short, longChord, short], 8);
    expect(lines.map((l) => l.length)).toEqual([1, 1, 1]);
  });
  test("clamps beatsPerLine to a minimum of 1 beat", () => {
    const a = { start_beat: 0, end_beat: 1 };
    const b = { start_beat: 0, end_beat: 1 };
    // cap 0 is clamped up to 1 -> each 1-beat chord on its own line
    expect(groupIntoLines([a, b], 0).map((l) => l.length)).toEqual([1, 1]);
    // sanity: with cap 2 they share a line, proving the clamp (not the overflow check) drove the split above
    expect(groupIntoLines([a, b], 2).map((l) => l.length)).toEqual([2]);
  });
});

describe("centisecond rule (round 2 #5)", () => {
  test("roundCs quantizes to 2 decimals", () => {
    expect(roundCs(1.23456)).toBe(1.23);
    expect(roundCs(2)).toBe(2);
  });
  test("formatTimeCs shows m:ss.cc", () => {
    expect(formatTimeCs(2.5)).toBe("0:02.50");
    expect(formatTimeCs(65.25)).toBe("1:05.25");
  });
});

describe("clampBoundary (#2)", () => {
  test("keeps the boundary inside its neighbours", () => {
    expect(clampBoundary(5, 0, 4)).toBe(3.95); // pinned below upper - min
    expect(clampBoundary(-1, 0, 4)).toBe(0.05); // pinned above lower + min
    expect(clampBoundary(2.4567, 0, 4)).toBe(2.46); // rounded to centisecond
  });
});

describe("boundaryUpdates (beat domain)", () => {
  const L = { id: "s1" };
  const R = { id: "s2" };
  test("growing the boundary patches the shrinking neighbour first", () => {
    expect(boundaryUpdates(L, R, 2, 3)).toEqual([
      { id: "s2", patch: { start_beat: 3 } },
      { id: "s1", patch: { end_beat: 3 } },
    ]);
  });
  test("shrinking the boundary patches the left segment first", () => {
    expect(boundaryUpdates(L, R, 2, 1)).toEqual([
      { id: "s1", patch: { end_beat: 1 } },
      { id: "s2", patch: { start_beat: 1 } },
    ]);
  });
  test("edge segments produce a single patch", () => {
    expect(boundaryUpdates(undefined, R, 0, 0.5)).toEqual([{ id: "s2", patch: { start_beat: 0.5 } }]);
    expect(boundaryUpdates(L, undefined, 4, 3.5)).toEqual([{ id: "s1", patch: { end_beat: 3.5 } }]);
  });
  test("no movement yields no patches", () => {
    expect(boundaryUpdates(L, R, 2, 2)).toEqual([]);
  });
});

const span = (s: number, e: number) => ({ start_beat: s, end_beat: e });
const lens = (w: { start_beat: number; end_beat: number }[]) =>
  w.map((x) => x.end_beat - x.start_beat);
const contiguous = (w: { start_beat: number; end_beat: number }[]) =>
  w.every((x, i) => i === 0 || Math.abs(x.start_beat - w[i - 1].end_beat) < 1e-9);

describe("redistributeLength", () => {
  const ABC = () => [span(0, 4), span(4, 8), span(8, 12)];

  test("growing an interior chord shrinks the next, total + later chords unchanged", () => {
    const out = redistributeLength(ABC(), 0, 6, 20);
    expect(lens(out)).toEqual([6, 2, 4]); // B gives 2 to A; C untouched
    expect(out[2].end_beat).toBe(12); // total conserved
    expect(contiguous(out)).toBe(true);
  });

  test("growing past the next chord's slack ripples into the chord after", () => {
    const out = redistributeLength([span(0, 4), span(4, 5), span(5, 9)], 0, 8, 20);
    expect(lens(out)).toEqual([8, 0.5, 0.5]); // B floored at 0.5, rest taken from C
    expect(out[2].end_beat).toBe(9); // total conserved
    expect(contiguous(out)).toBe(true);
  });

  test("growth is capped at the followers' available slack", () => {
    const out = redistributeLength(ABC(), 0, 20, 20);
    expect(lens(out)).toEqual([11, 0.5, 0.5]); // 7 beats of slack max
    expect(out[2].end_beat).toBe(12);
  });

  test("shrinking an interior chord gives beats to the next, total conserved", () => {
    const out = redistributeLength(ABC(), 0, 2, 20);
    expect(lens(out)).toEqual([2, 6, 4]);
    expect(out[2].end_beat).toBe(12);
    expect(contiguous(out)).toBe(true);
  });

  test("growing the last chord is clamped at maxTotalBeats", () => {
    const out = redistributeLength(ABC(), 2, 20, 14);
    expect(out[2].end_beat).toBe(14); // clamped to the grid
  });

  test("snaps the requested length to the nearest half-beat", () => {
    const out = redistributeLength(ABC(), 0, 5.3, 20); // 5.3 -> 5.5
    expect(lens(out)[0]).toBe(5.5);
  });

  test("last-chord clamp never exceeds a fractional maxTotalBeats with sub-MIN headroom", () => {
    // Grid ends at 11.9; the last chord starts at 11.5 (0.4 beats of room, < MIN_BEATS).
    const out = redistributeLength([span(0, 11.5), span(11.5, 11.9)], 1, 5, 11.9);
    expect(out[1].end_beat).toBeLessThanOrEqual(11.9 + 1e-9);
    expect(out[1].end_beat).toBeGreaterThan(out[1].start_beat);
  });
});
