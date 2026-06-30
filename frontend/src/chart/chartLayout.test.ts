import { describe, expect, it, test } from "vitest";
import { boundaryUpdates, groupIntoLines, reorderIds } from "./chartLayout";
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
  test("caps minimum beatsPerLine at 1", () => {
    const items = [seg(1), seg(1)];
    const lines = groupIntoLines(items, 0);
    expect(lines.map((l) => l.length)).toEqual([1, 1]);
  });
});

describe("reorderIds (round 2 #4)", () => {
  const ids = ["a", "b", "c", "d"];
  test("moves an item later, pushing the rest left", () => {
    expect(reorderIds(ids, "a", 3)).toEqual(["b", "c", "a", "d"]);
  });
  test("moves an item earlier, pushing the rest right", () => {
    expect(reorderIds(ids, "d", 1)).toEqual(["a", "d", "b", "c"]);
  });
  test("inserting at its own gap is a no-op order", () => {
    expect(reorderIds(ids, "b", 1)).toEqual(["a", "b", "c", "d"]);
  });
  test("clamps an out-of-range gap to the end", () => {
    expect(reorderIds(ids, "a", 99)).toEqual(["b", "c", "d", "a"]);
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
