import { describe, expect, test } from "vitest";
import { boundaryUpdates, chordsPerLine } from "./chartLayout";
import { roundMs, formatTimeMs, clampBoundary } from "./timeMath";

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

describe("millisecond rule (#7)", () => {
  test("roundMs quantizes to 3 decimals", () => {
    expect(roundMs(1.23456)).toBe(1.235);
    expect(roundMs(2)).toBe(2);
  });
  test("formatTimeMs shows m:ss.mmm", () => {
    expect(formatTimeMs(2.5)).toBe("0:02.500");
    expect(formatTimeMs(65.25)).toBe("1:05.250");
  });
});

describe("clampBoundary (#2)", () => {
  test("keeps the boundary inside its neighbours", () => {
    expect(clampBoundary(5, 0, 4)).toBe(3.95); // pinned below upper - min
    expect(clampBoundary(-1, 0, 4)).toBe(0.05); // pinned above lower + min
    expect(clampBoundary(2.4567, 0, 4)).toBe(2.457); // rounded to ms
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
