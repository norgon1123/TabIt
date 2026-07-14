import { describe, it, expect } from "vitest";
import { barBeatAt, formatMusicalPosition, type BeatGridInfo } from "./musicalPosition";

/** 120 BPM, 4/4: a beat every 0.5s, a bar every 2s. */
const GRID: BeatGridInfo = {
  beatTimes: Array.from({ length: 33 }, (_, i) => i * 0.5), // beats 0..32 => 0s..16s
  bpm: 120,
  duration: 16,
  beatsPerMeasure: 4,
  measureOffset: 0,
};

describe("barBeatAt", () => {
  it("counts from ONE, the way a musician does", () => {
    // Beat index 0 is "bar 1, beat 1". A player who is told "bar 0" will not know what
    // you mean — there is no bar zero on any chart they have ever read.
    expect(barBeatAt(GRID, 0)).toEqual({ bar: 1, beat: 1 });
  });

  it("walks the beats within a bar", () => {
    expect(barBeatAt(GRID, 0.5)).toEqual({ bar: 1, beat: 2 });
    expect(barBeatAt(GRID, 1.0)).toEqual({ bar: 1, beat: 3 });
    expect(barBeatAt(GRID, 1.5)).toEqual({ bar: 1, beat: 4 });
  });

  it("rolls over into the next bar", () => {
    expect(barBeatAt(GRID, 2.0)).toEqual({ bar: 2, beat: 1 });
    expect(barBeatAt(GRID, 4.0)).toEqual({ bar: 3, beat: 1 });
    expect(barBeatAt(GRID, 15.5)).toEqual({ bar: 8, beat: 4 });
  });

  it("holds the beat until the next onset — it does not round up early", () => {
    // Mid-beat is still that beat. Announcing "beat 3" when you are 40% through beat 2
    // would be a lie, and the whole point of this string is that a player can trust it.
    expect(barBeatAt(GRID, 0.7)).toEqual({ bar: 1, beat: 2 });
    expect(barBeatAt(GRID, 0.999)).toEqual({ bar: 1, beat: 2 });
  });

  it("puts anything before the first downbeat in a PICKUP, not in bar 1", () => {
    // A song with a 1-beat pickup: the bar line falls one beat late.
    //
    // This is the case that decides the whole design. If pre-downbeat material is clamped
    // into bar 1, then the pickup announces "bar 1, beat 4" and the very next beat
    // announces "bar 1, beat 1" — beat 4 arriving BEFORE beat 1 inside the same bar. Read
    // aloud that is gibberish, and it would make the readout untrustworthy. Musicians do
    // not number an anacrusis as bar 1; they call it a pickup. So do we.
    const pickup: BeatGridInfo = { ...GRID, measureOffset: 1 };
    expect(barBeatAt(pickup, 0)).toEqual({ bar: 0, beat: 4 });   // the pickup beat
    expect(barBeatAt(pickup, 0.5)).toEqual({ bar: 1, beat: 1 }); // the first downbeat
    expect(barBeatAt(pickup, 2.5)).toEqual({ bar: 2, beat: 1 });
  });

  it("handles times below zero and past the end without returning nonsense", () => {
    expect(barBeatAt(GRID, -5)).toEqual({ bar: 1, beat: 1 });
    const past = barBeatAt(GRID, 999);
    expect(Number.isFinite(past.bar)).toBe(true);
    expect(past.beat).toBeGreaterThanOrEqual(1);
    expect(past.beat).toBeLessThanOrEqual(4);
  });

  it("survives a chart with no beat grid at all", () => {
    // A chart analysed before beat_times existed, or one whose tracker found nothing.
    // It must degrade to the BPM rather than divide by zero or return NaN.
    const noGrid: BeatGridInfo = { ...GRID, beatTimes: [] };
    const p = barBeatAt(noGrid, 2.0);
    expect(Number.isFinite(p.bar)).toBe(true);
    expect(Number.isFinite(p.beat)).toBe(true);
    expect(p).toEqual({ bar: 2, beat: 1 });
  });

  it("survives a 1-beat measure without dividing by zero", () => {
    const odd: BeatGridInfo = { ...GRID, beatsPerMeasure: 0 };
    const p = barBeatAt(odd, 1.0);
    expect(Number.isFinite(p.bar)).toBe(true);
    expect(Number.isFinite(p.beat)).toBe(true);
  });
});

describe("formatMusicalPosition", () => {
  it("reads the way a bandleader counts you in", () => {
    // This string is spoken aloud by a screen reader. "bar 12, beat 2" is what a player
    // says. "87 seconds" is not, and is the reason we cannot keep the native audio
    // element's own slider.
    expect(formatMusicalPosition({ bar: 12, beat: 2 })).toBe("bar 12, beat 2");
    expect(formatMusicalPosition({ bar: 1, beat: 1 })).toBe("bar 1, beat 1");
  });

  it("calls a pickup a pickup", () => {
    expect(formatMusicalPosition({ bar: 0, beat: 4 })).toBe("pickup, beat 4");
    expect(formatMusicalPosition({ bar: -1, beat: 2 })).toBe("pickup, beat 2");
  });
});

describe("an offset larger than the bar", () => {
  // Reachable in two clicks: set a 3-beat pickup, then shrink the bar to 2 beats. The API
  // validates the two fields independently and never relates them.
  const OVERSHOOT: BeatGridInfo = {
    beatTimes: Array.from({ length: 20 }, (_, i) => i * 0.5),
    bpm: 120,
    duration: 10,
    beatsPerMeasure: 2,
    measureOffset: 3, // >= beatsPerMeasure
  };

  it("never repeats a beat number non-consecutively", () => {
    // The old behaviour was "pickup beat 2, pickup beat 1, pickup beat 2" — a player has
    // no way to order those, and a readout they cannot trust is worse than no readout.
    const said = [0, 0.5, 1.0, 1.5, 2.0].map((t) =>
      formatMusicalPosition(barBeatAt(OVERSHOOT, t)),
    );
    expect(said).toEqual([
      "pickup, beat 2",
      "bar 1, beat 1",
      "bar 1, beat 2",
      "bar 2, beat 1",
      "bar 2, beat 2",
    ]);
  });

  it("folds a whole-bar shift away, because it is a no-op", () => {
    // An offset of 3 in a 2-beat bar IS an offset of 1. Same bar line, same music.
    const folded: BeatGridInfo = { ...OVERSHOOT, measureOffset: 1 };
    for (const t of [0, 0.5, 1.0, 1.5, 2.0]) {
      expect(barBeatAt(OVERSHOOT, t)).toEqual(barBeatAt(folded, t));
    }
  });
});

describe("a negative offset", () => {
  it("is folded into the bar rather than producing nonsense", () => {
    // Unreachable through the API today (ge=0), but a total function is cheaper to trust
    // than one with a precondition nobody enforces.
    const neg: BeatGridInfo = {
      beatTimes: Array.from({ length: 20 }, (_, i) => i * 0.5),
      bpm: 120,
      duration: 10,
      beatsPerMeasure: 4,
      measureOffset: -1,
    };
    expect(formatMusicalPosition(barBeatAt(neg, 0))).toBe("pickup, beat 2");
    expect(formatMusicalPosition(barBeatAt(neg, 1.5))).toBe("bar 1, beat 1");
  });
});
