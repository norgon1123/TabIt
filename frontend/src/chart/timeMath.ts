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
