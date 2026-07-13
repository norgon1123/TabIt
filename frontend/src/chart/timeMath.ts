export function pixelToTime(
  clientX: number,
  rect: { left: number; width: number },
  duration: number,
): number {
  if (rect.width <= 0) return 0;
  const fraction = (clientX - rect.left) / rect.width;
  return Math.max(0, Math.min(duration, fraction * duration));
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Track length, zero-padded to MM:SS (no recording is expected to reach an hour).
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// Round 2 #5: times are universally quantized to (and displayed at) the centisecond.
export function roundCs(seconds: number): number {
  return Math.round(seconds * 100) / 100;
}

export function formatTimeCs(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = safe - mins * 60;
  return `${mins}:${secs.toFixed(2).padStart(5, "0")}`;
}

// Keep a dragged boundary inside its neighbours, never shorter than a small minimum.
export function clampBoundary(
  newTime: number,
  lowerBound: number,
  upperBound: number,
  min = 0.05,
): number {
  return roundCs(Math.max(lowerBound + min, Math.min(upperBound - min, newTime)));
}
