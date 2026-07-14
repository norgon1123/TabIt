import { useEffect, useMemo, useRef, useState } from "react";
import type { SegmentOut } from "../api/types";
import {
  boundaryUpdates,
  groupIntoLines,
  MEASURES_PER_LINE,
  type SegmentUpdate,
} from "./chartLayout";
import { beatSlashMarks, clampBeatBoundary } from "./beatMath";
import { paintChordFill } from "./chordProgress";
import { chordLabel } from "../api/music";
import { barBeatAt, formatMusicalPosition, type BeatGridInfo } from "./musicalPosition";

export type { SegmentUpdate };

interface Props {
  segments: SegmentOut[];
  beatsPerMeasure: number;
  measureOffset: number;
  duration: number;
  currentTime: number;
  /** The chart's beat grid, so each cell can announce WHERE it is ("bar 3, beat 1") —
   *  the thing a sighted player reads off the page instantly and a screen reader could not
   *  say at all. */
  grid: BeatGridInfo;
  playing?: boolean;
  rate?: number;
  selectedId: string | null;
  /** Chords the player has yet to name (practice mode). A masked cell keeps its beats — the
   *  rhythm is the question's context — but shows "?" for the chord, and drops the roman
   *  numeral, which against a known key would hand over the answer. */
  maskedIds?: ReadonlySet<string>;
  onSelect: (segmentId: string) => void;
  onSeek?: (time: number) => void;
  onResizeCommit?: (updates: SegmentUpdate[]) => void;
}

// Horizontal pointer movement -> beats for the resize handles.
const BEATS_PER_PIXEL = 0.05;

const NO_MASK: ReadonlySet<string> = new Set();

export default function Timeline({
  segments,
  beatsPerMeasure,
  measureOffset,
  currentTime,
  playing = false,
  rate = 1,
  selectedId,
  maskedIds = NO_MASK,
  grid,
  onSelect,
  onSeek,
  onResizeCommit,
}: Props) {
  // Layout is by beats; playback positioning uses the derived seconds.
  const ordered = useMemo(
    () => [...segments].sort((a, b) => a.start_beat - b.start_beat),
    [segments],
  );
  const indexById = useMemo(
    () => new Map(ordered.map((s, i) => [s.id, i] as const)),
    [ordered],
  );
  const beatsPerLine = Math.max(1, beatsPerMeasure) * MEASURES_PER_LINE;
  const lines = groupIntoLines(ordered, beatsPerLine);
  const suppressClick = useRef(false);

  // The chord under the playhead, derived from currentTime (seconds). A precise
  // timer advances it exactly at the chord boundary so the highlight switches on
  // time instead of waiting for the next (~4Hz) timeupdate.
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    const active =
      ordered.find((s) => currentTime >= s.start_time && currentTime < s.end_time) ?? null;
    setActiveId(active?.id ?? null);
    if (!playing || !active) return;
    const remainingMs = ((active.end_time - currentTime) / (rate || 1)) * 1000;
    const timer = window.setTimeout(() => {
      const next = ordered.find((s) => s.start_time >= active.end_time) ?? null;
      setActiveId(next?.id ?? null);
    }, Math.max(0, remainingMs));
    return () => window.clearTimeout(timer);
  }, [ordered, currentTime, playing, rate]);

  // Drive the active chord's fill with a compositor (GPU) CSS transition: arm it
  // toward 100% over the chord's remaining real time while playing, or snap it to
  // the true fraction while paused. Re-runs each timeupdate to re-sync any drift.
  const fillRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const fill = fillRef.current;
    if (!fill) return;
    const seg = ordered.find((s) => s.id === activeId);
    if (!seg) return;
    paintChordFill(fill, {
      startTime: seg.start_time,
      endTime: seg.end_time,
      currentTime,
      playing,
      rate,
    });
  }, [activeId, ordered, currentTime, playing, rate]);

  function startResize(index: number, edge: "left" | "right", e: React.PointerEvent) {
    e.stopPropagation();
    suppressClick.current = false;
    if (!onResizeCommit) return;
    const seg = ordered[index];
    const left = edge === "left" ? ordered[index - 1] : seg;
    const right = edge === "left" ? seg : ordered[index + 1];
    const oldBoundary = edge === "left" ? seg.start_beat : seg.end_beat;
    const lower = left ? left.start_beat : 0;
    const upper = right ? right.end_beat : oldBoundary + beatsPerMeasure;
    const startX = e.clientX;

    const move = (ev: PointerEvent) => ev.preventDefault();
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      suppressClick.current = true;
      const db = (ev.clientX - startX) * BEATS_PER_PIXEL;
      const boundary = clampBeatBoundary(oldBoundary + db, lower, upper);
      const updates = boundaryUpdates(left, right, oldBoundary, boundary);
      if (updates.length) onResizeCommit(updates);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <ul className="chart-lines" aria-label="Chord chart">
      {lines.map((line, li) => (
        // A LINE is a layout artefact — the chart wraps at whatever width the window happens
        // to be, and a line break means nothing musically. role="presentation" keeps it out of
        // the accessibility tree: a screen-reader user must not be told about a break that a
        // wider window would remove. The chords are the list; the lines are just where they
        // landed today.
        <li key={li} className="chart-line" role="presentation">
          {line.map((s) => {
            const i = indexById.get(s.id)!;
            const selected = s.id === selectedId;
            const isActive = s.id === activeId;
            const masked = maskedIds.has(s.id);
            const beats = Math.max(0.5, s.end_beat - s.start_beat);
            // A bar line is drawn on the left edge of cells that start a measure.
            const onMeasure =
              Math.abs(((s.start_beat - measureOffset) % beatsPerMeasure)) < 1e-6;

            // A sighted player reads position, length and the bar line off the page instantly.
            // "C, button" — which is all the old markup said — gave a screen-reader user none
            // of it.
            //
            // A MASKED chord keeps its secret but keeps its position and its length: in
            // practice mode the chord is the question, but the rhythm is the question's
            // CONTEXT and a player needs something to guess against.
            const what = masked ? "Hidden chord" : chordLabel(s.chord_root, s.chord_quality);
            const where = formatMusicalPosition(barBeatAt(grid, s.start_time)); // "bar 3, beat 1"
            const howLong = `${beats} ${beats === 1 ? "beat" : "beats"}`;
            // The measure rule is a graphical object. A screen reader cannot see 3px of
            // --bar-line, so it has to be said.
            const startsBar = onMeasure ? ", starts a bar" : "";

            const label = `${what}, ${where}, ${howLong}${startsBar}`;

            return (
              <span
                key={s.id}
                role="listitem"
                className="chord-cell__item"
                // Runtime geometry ONLY: the cell's width IS the chord's beat count. This
                // moved off the <button> and onto its wrapper, because the wrapper is now the
                // flex child. Losing it makes every chord the same width — and NO a11y test
                // would catch that.
                style={{ flex: `${beats} 1 0` }}
              >
                <button
                  type="button"
                  className="chord-cell"
                  data-bar-start={onMeasure ? "true" : undefined}
                  data-selected={selected ? "true" : undefined}
                  data-playing={isActive ? "true" : undefined}
                  data-masked={masked ? "true" : undefined}
                  aria-pressed={selected}
                  aria-label={label}
                  data-segment-id={s.id}
                  onClick={() => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    onSelect(s.id);
                    onSeek?.(s.start_time);
                  }}
                  // The cell says it is a button, so it has to answer to one. In practice mode
                  // this is the only way in: clicking a chord *is* the question, and a player on
                  // the keyboard would otherwise have no way to name a single one.
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault(); // Space scrolls the page otherwise
                    onSelect(s.id);
                    onSeek?.(s.start_time);
                  }}
                >
                  {onResizeCommit && (
                    <span
                      className="chord-cell__resize chord-cell__resize--left"
                      aria-label={`Resize start of ${chordLabel(s.chord_root, s.chord_quality)}`}
                      draggable={false}
                      onPointerDown={(e) => startResize(i, "left", e)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <strong>{masked ? "?" : chordLabel(s.chord_root, s.chord_quality)}</strong>
                  <span className="muted slash-marks">{beatSlashMarks(beats)}</span>
                  {/* The roman numeral names the chord's degree — against a key the player can
                      see, that is the answer. Masked cells go without it. */}
                  <span className="muted">{masked ? "" : s.roman_numeral}</span>
                  {onResizeCommit && (
                    <span
                      className="chord-cell__resize chord-cell__resize--right"
                      aria-label={`Resize end of ${chordLabel(s.chord_root, s.chord_quality)}`}
                      draggable={false}
                      onPointerDown={(e) => startResize(i, "right", e)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  {isActive && (
                    <span
                      ref={fillRef}
                      aria-hidden
                      className="chord-progress"
                      // Runtime geometry ONLY: how far through the chord we are, repainted
                      // per-frame by chordProgress.ts. Everything else about this element
                      // (position, size, colour) lives in CSS.
                      style={{ transform: "scaleX(0)" }}
                    />
                  )}
                </button>
              </span>
            );
          })}
        </li>
      ))}
    </ul>
  );
}
