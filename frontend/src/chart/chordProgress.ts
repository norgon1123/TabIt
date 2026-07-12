export interface ChordFill {
  /** Active chord's bounds, in seconds. */
  startTime: number;
  endTime: number;
  /** Latest media-clock reading; lags the true position by up to a timeupdate (~250ms). */
  currentTime: number;
  playing: boolean;
  rate: number;
}

/**
 * Paint the active chord's progress bar: snap it to the fraction of the chord already
 * played, then — while playing — hand the rest to a compositor transition that runs out
 * the chord's remaining real time.
 *
 * The flush in the middle is load-bearing. The bar is a fresh element on every chord
 * change, so the browser holds no computed value to interpolate *from*; if the target
 * (scaleX(1)) is written before the start value has been committed, both writes collapse
 * into one style recalc, the transition never runs, and the bar renders full the instant
 * the chord starts. Reading a layout property forces the start value into the element's
 * computed style so the transition has somewhere to begin.
 */
export function paintChordFill(el: HTMLElement, fill: ChordFill): void {
  const { startTime, endTime, currentTime, playing, rate } = fill;
  const span = Math.max(0.01, endTime - startTime);
  // The clock can still sit in the previous chord when the boundary timer hands over, so
  // measure from a position clamped into this chord rather than from the stale reading.
  const position = Math.min(endTime, Math.max(startTime, currentTime));

  el.style.transition = "none";
  el.style.transform = `scaleX(${(position - startTime) / span})`;
  void el.offsetWidth;
  if (!playing) return;

  const remaining = (endTime - position) / (rate || 1);
  el.style.transition = `transform ${remaining}s linear`;
  el.style.transform = "scaleX(1)";
}
