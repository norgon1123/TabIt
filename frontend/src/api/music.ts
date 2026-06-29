// Note names accepted by the backend (^[A-G][b#]?$), in chromatic-ish order.
export const ROOTS = [
  "C", "C#", "Db", "D", "D#", "Eb", "E", "F",
  "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B",
];

export const QUALITIES = ["maj", "min", "dom7", "maj7", "min7"] as const;

export const QUALITY_LABELS: Record<(typeof QUALITIES)[number], string> = {
  maj: "Major",
  min: "Minor",
  dom7: "Dominant 7th",
  maj7: "Major 7th",
  min7: "Minor 7th",
};
