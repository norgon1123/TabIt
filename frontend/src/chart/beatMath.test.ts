import { describe, expect, it } from "vitest";
import { beatSlashMarks, clampBeatBoundary, snapHalfBeat } from "./beatMath";

describe("beatMath", () => {
  it("snaps to the nearest half beat", () => {
    expect(snapHalfBeat(1.24)).toBe(1);
    expect(snapHalfBeat(1.26)).toBe(1.5);
  });
  it("clamps inside neighbours and snaps", () => {
    expect(clampBeatBoundary(0.1, 0, 4)).toBe(0.5);
    expect(clampBeatBoundary(3.9, 0, 4)).toBe(3.5);
    expect(clampBeatBoundary(2.24, 0, 4)).toBe(2);
  });
  it("renders one slash per beat after the first, half-beat as a tick", () => {
    expect(beatSlashMarks(4)).toBe("╱ ╱ ╱");
    expect(beatSlashMarks(1)).toBe("");
    expect(beatSlashMarks(2.5)).toBe("╱ ·");
  });
});
