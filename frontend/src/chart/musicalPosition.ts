/** Where you are in the song, in the units a player actually counts.
 *
 *  A scrubber that announces "87 seconds" tells a musician nothing. "Bar 12, beat 2" tells
 *  them exactly where to put their hands. This module is the translation, and it is the
 *  reason Phase 2 replaces the native <audio> element's slider — that slider only knows
 *  seconds and cannot be taught otherwise. */

const DEFAULT_BPM = 120;

export interface BeatGridInfo {
  /** Ascending beat-onset seconds, as the analysis produced them. May be empty. */
  beatTimes: number[];
  bpm: number | null;
  duration: number;
  beatsPerMeasure: number;
  /** Which beat the first bar line falls on — a pickup shifts it. */
  measureOffset: number;
}

/** `beat` is 1-based, always. `bar` is 1-based for the song proper, and **0 or below for a
 *  pickup** — material before the first downbeat, which musicians do not number as bar 1. */
export interface MusicalPosition {
  bar: number;
  beat: number;
}

/** The beat index (0-based, may be fractional) at a given time.
 *  Falls back to a straight BPM division when the tracker found no onsets. */
function beatIndexAt(grid: BeatGridInfo, timeSeconds: number): number {
  const t = Math.max(0, timeSeconds);
  const times = [...grid.beatTimes].sort((a, b) => a - b);

  if (times.length < 2) {
    const tempo = grid.bpm && grid.bpm > 0 ? grid.bpm : DEFAULT_BPM;
    return t / (60 / tempo);
  }

  if (t <= times[0]) return 0;
  const last = times.length - 1;
  if (t >= times[last]) {
    const step = times[last] - times[last - 1];
    return step > 0 ? last + (t - times[last]) / step : last;
  }

  let i = 0;
  while (i < last && times[i + 1] <= t) i += 1;
  const step = times[i + 1] - times[i];
  return step > 0 ? i + (t - times[i]) / step : i;
}

export function barBeatAt(grid: BeatGridInfo, timeSeconds: number): MusicalPosition {
  const perMeasure = Math.max(1, Math.floor(grid.beatsPerMeasure) || 1);

  // Shifting the bar line by a whole bar is a no-op, so fold the offset into one bar.
  //
  // This is not defensive padding: `measure_offset` and `beats_per_measure` are validated
  // independently by the API (ge=0 and ge=1..16, with no cross-field check), so a user can
  // set a 3-beat pickup and then shrink the bar to 2 beats — two clicks in
  // TimeSignatureControl. Without this, the readout emits "pickup beat 2, pickup beat 1,
  // pickup beat 2" — the same beat number recurring non-consecutively, which a player
  // cannot order, and an untrustworthy readout is worse than none.
  //
  // Sign-safe, like the modulo below: JS's % keeps the dividend's sign.
  const offset = (((Math.floor(grid.measureOffset) % perMeasure) + perMeasure) % perMeasure);

  // Floor, never round: mid-beat is still that beat. Announcing the next one while the
  // player is only 40% into this one would make the readout untrustworthy, and the only
  // thing this string has going for it is that a player can trust it.
  const absolute = Math.floor(beatIndexAt(grid, timeSeconds));

  // measureOffset says which beat carries the bar line. Shift, then wrap into the bar.
  // The modulo is written the long way because JS's % keeps the sign of the dividend:
  // -1 % 4 is -1, not 3, and a pickup makes `shifted` negative.
  const shifted = absolute - offset;
  const beatInBar = ((shifted % perMeasure) + perMeasure) % perMeasure;

  // Deliberately NOT clamped to 1. Anything before the first downbeat gets bar <= 0, and
  // formatMusicalPosition calls it a pickup.
  //
  // Clamping was the first thing I wrote and it is wrong: with a one-beat pickup it makes
  // the anacrusis announce "bar 1, beat 4" and the very next beat announce "bar 1, beat 1"
  // — beat 4 arriving BEFORE beat 1 inside the same bar. Read aloud that is gibberish, and
  // a readout a player cannot trust is worse than no readout.
  return {
    bar: Math.floor(shifted / perMeasure) + 1,
    beat: beatInBar + 1,
  };
}

export function formatMusicalPosition(p: MusicalPosition): string {
  // A pickup is not bar 1 and no musician calls it that. Naming it is both more honest and
  // more useful: "pickup, beat 4" tells a player exactly what they are hearing.
  if (p.bar < 1) return `pickup, beat ${p.beat}`;
  return `bar ${p.bar}, beat ${p.beat}`;
}
