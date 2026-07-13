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

export type { SegmentUpdate };

interface Props {
  segments: SegmentOut[];
  beatsPerMeasure: number;
  measureOffset: number;
  duration: number;
  currentTime: number;
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
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {lines.map((line, li) => (
        <div key={li} style={{ display: "flex", justifyContent: "flex-start", gap: 0 }}>
          {line.map((s) => {
            const i = indexById.get(s.id)!;
            const selected = s.id === selectedId;
            const isActive = s.id === activeId;
            const masked = maskedIds.has(s.id);
            const beats = Math.max(0.5, s.end_beat - s.start_beat);
            // A bar line is drawn on the left edge of cells that start a measure.
            const onMeasure =
              Math.abs(((s.start_beat - measureOffset) % beatsPerMeasure)) < 1e-6;
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={masked ? `Hidden chord, ${beats} beats` : undefined}
                className={[
                  "chord-cell",
                  isActive && "playing",
                  selected && "selected",
                  masked && "chord-cell--masked",
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-segment-id={s.id}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  onSelect(s.id);
                  onSeek?.(s.start_time);
                }}
                style={{
                  position: "relative",
                  // Width tracks the chord's beat count within the line.
                  flex: `${beats} 1 0`,
                  minWidth: 56,
                  height: 64,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  overflow: "hidden",
                  border: selected ? "2px solid var(--accent)" : "1px solid var(--line)",
                  borderLeft: selected
                    ? "2px solid var(--accent)"
                    : onMeasure
                      ? "3px solid var(--bar-line)"
                      : "1px solid var(--line)",
                  background: isActive ? "#26303f" : "var(--panel)",
                }}
              >
                {onResizeCommit && (
                  <span
                    aria-label={`Resize start of ${chordLabel(s.chord_root, s.chord_quality)}`}
                    draggable={false}
                    onPointerDown={(e) => startResize(i, "left", e)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize" }}
                  />
                )}
                <strong>{masked ? "?" : chordLabel(s.chord_root, s.chord_quality)}</strong>
                <span className="muted slash-marks">{beatSlashMarks(beats)}</span>
                {/* The roman numeral names the chord's degree — against a key the player can
                    see, that is the answer. Masked cells go without it. */}
                <span className="muted">{masked ? "" : s.roman_numeral}</span>
                {onResizeCommit && (
                  <span
                    aria-label={`Resize end of ${chordLabel(s.chord_root, s.chord_quality)}`}
                    draggable={false}
                    onPointerDown={(e) => startResize(i, "right", e)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize" }}
                  />
                )}
                {isActive && (
                  <span
                    ref={fillRef}
                    aria-hidden
                    className="chord-progress"
                    style={{
                      position: "absolute",
                      left: 0,
                      bottom: 0,
                      height: 4,
                      width: "100%",
                      transformOrigin: "left",
                      transform: "scaleX(0)",
                      background: "var(--accent)",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
