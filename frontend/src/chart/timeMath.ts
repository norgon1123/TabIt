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

// #7: times are universally quantized to (and displayed at) the millisecond.
export function roundMs(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

export function formatTimeMs(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = safe - mins * 60;
  return `${mins}:${secs.toFixed(3).padStart(6, "0")}`;
}

// Keep a dragged boundary inside its neighbours, never shorter than a small minimum.
export function clampBoundary(
  newTime: number,
  lowerBound: number,
  upperBound: number,
  min = 0.05,
): number {
  return roundMs(Math.max(lowerBound + min, Math.min(upperBound - min, newTime)));
}
