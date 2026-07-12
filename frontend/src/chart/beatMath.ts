export function snapHalfBeat(beat: number): number {
  return Math.round(beat * 2) / 2;
}

export function clampBeatBoundary(
  beat: number,
  lower: number,
  upper: number,
  min = 0.5,
): number {
  const clamped = Math.max(lower + min, Math.min(upper - min, beat));
  return snapHalfBeat(clamped);
}

// "╱ ╱ ╱ ╱" rhythm: one slash per whole beat; a trailing half-beat renders as a
// short tick. Returns just the marks (no chord name).
export function beatSlashMarks(beats: number): string {
  const whole = Math.floor(beats);
  const half = beats - whole >= 0.5;
  const marks: string[] = [];
  for (let i = 0; i < whole; i += 1) marks.push("╱");
  if (half) marks.push("·");
  return marks.join(" ");
}
