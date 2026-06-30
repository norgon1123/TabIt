import { describe, expect, test } from "vitest";
import { boundaryUpdates, chordsPerLine, groupIntoLines } from "./chartLayout";
import { roundCs, formatTimeCs, clampBoundary } from "./timeMath";

describe("chordsPerLine", () => {
  test("scales with BPM between 4 and 16", () => {
    expect(chordsPerLine(60)).toBe(4);
    expect(chordsPerLine(120)).toBe(8);
    expect(chordsPerLine(240)).toBe(16);
  });
  test("clamps extremes", () => {
    expect(chordsPerLine(20)).toBe(4); // floor
    expect(chordsPerLine(400)).toBe(16); // ceiling
  });
  test("falls back to 8 when BPM is missing or invalid", () => {
    expect(chordsPerLine(null)).toBe(8);
    expect(chordsPerLine(0)).toBe(8);
    expect(chordsPerLine(undefined)).toBe(8);
  });
});

describe("groupIntoLines (round 2 #3)", () => {
  test("chunks into lines of perLine, last line may be shorter", () => {
    expect(groupIntoLines([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  test("never produces a zero-length chunk", () => {
    expect(groupIntoLines([1, 2], 0)).toEqual([[1], [2]]);
  });
  test("empty input yields no lines", () => {
    expect(groupIntoLines([], 4)).toEqual([]);
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

describe("boundaryUpdates (#2)", () => {
  const L = { id: "s1" };
  const R = { id: "s2" };
  test("growing the boundary patches the shrinking neighbour first", () => {
    expect(boundaryUpdates(L, R, 2, 3)).toEqual([
      { id: "s2", patch: { start_time: 3 } },
      { id: "s1", patch: { end_time: 3 } },
    ]);
  });
  test("shrinking the boundary patches the left segment first", () => {
    expect(boundaryUpdates(L, R, 2, 1)).toEqual([
      { id: "s1", patch: { end_time: 1 } },
      { id: "s2", patch: { start_time: 1 } },
    ]);
  });
  test("edge segments produce a single patch", () => {
    expect(boundaryUpdates(undefined, R, 0, 0.5)).toEqual([{ id: "s2", patch: { start_time: 0.5 } }]);
    expect(boundaryUpdates(L, undefined, 4, 3.5)).toEqual([{ id: "s1", patch: { end_time: 3.5 } }]);
  });
  test("no movement yields no patches", () => {
    expect(boundaryUpdates(L, R, 2, 2)).toEqual([]);
  });
});
