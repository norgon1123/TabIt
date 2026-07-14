// Note names accepted by the backend (^[A-G][b#]?$), in chromatic-ish order.
export const ROOTS = [
  "C", "C#", "Db", "D", "D#", "Eb", "E", "F",
  "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B",
];

/** Note name → pitch class (C = 0). Enharmonics collapse: Db and C# are both 1, so anything
 *  comparing two roots by *sound* rather than by spelling goes through this. */
export const PITCH_CLASS: Record<string, number> = {
  C: 0, "B#": 0,
  "C#": 1, Db: 1,
  D: 2,
  "D#": 3, Eb: 3,
  E: 4, Fb: 4,
  F: 5, "E#": 5,
  "F#": 6, Gb: 6,
  G: 7,
  "G#": 8, Ab: 8,
  A: 9,
  "A#": 10, Bb: 10,
  B: 11, Cb: 11,
};

// Key modes accepted by the backend (^(major|minor)$).
export const MODES = ["major", "minor"] as const;

export const MODE_LABELS: Record<(typeof MODES)[number], string> = {
  major: "Major",
  minor: "Minor",
};

export const QUALITIES = ["maj", "min", "dom7", "maj7", "min7"] as const;

export const QUALITY_LABELS: Record<(typeof QUALITIES)[number], string> = {
  maj: "Major",
  min: "Minor",
  dom7: "Dominant 7th",
  maj7: "Major 7th",
  min7: "Minor 7th",
};

/** How a chord is written on a chart: C, Am, G7, Fmaj7. */
export function chordLabel(root: string, quality: string): string {
  const suffix = quality === "maj" ? "" : quality === "min" ? "m" : quality;
  return `${root}${suffix}`;
}
