import { describe, expect, test } from "vitest";
import { totalBeats } from "./beatGrid";

describe("totalBeats", () => {
  test("synthesizes a 120 BPM grid when no beat times are present (0.5s/beat)", () => {
    // 10s at 120 BPM -> 20 beats.
    expect(totalBeats([], null, 10)).toBeCloseTo(20, 6);
  });

  test("uses the provided bpm to synthesize the grid", () => {
    // 60 BPM -> 1s/beat -> 10 beats over 10s.
    expect(totalBeats([], 60, 10)).toBeCloseTo(10, 6);
  });

  test("interpolates within a detected grid", () => {
    // beats at 0,1,2,3s; duration 2.5s -> beat 2.5.
    expect(totalBeats([0, 1, 2, 3], 120, 2.5)).toBeCloseTo(2.5, 6);
  });

  test("extrapolates past the last detected onset using the final interval", () => {
    // last interval 1s; duration 5s, grid ends at 3 (beat 3) -> 3 + 2 = 5.
    expect(totalBeats([0, 1, 2, 3], 120, 5)).toBeCloseTo(5, 6);
  });
});
