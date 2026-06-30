import { useEffect, useMemo, useRef, useState } from "react";
import type { SegmentOut } from "../api/types";
import {
  boundaryUpdates,
  groupIntoLines,
  MEASURES_PER_LINE,
  type SegmentUpdate,
} from "./chartLayout";
import { beatSlashMarks, clampBeatBoundary } from "./beatMath";

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
  onSelect: (segmentId: string) => void;
  onSeek?: (time: number) => void;
  onResizeCommit?: (updates: SegmentUpdate[]) => void;
}

// Horizontal pointer movement -> beats for the resize handles.
const BEATS_PER_PIXEL = 0.05;

function chordLabel(s: SegmentOut): string {
  const q = s.chord_quality === "maj" ? "" : s.chord_quality === "min" ? "m" : s.chord_quality;
  return `${s.chord_root}${q}`;
}

export default function Timeline({
  segments,
  beatsPerMeasure,
  measureOffset,
  currentTime,
  playing = false,
  rate = 1,
  selectedId,
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
    const span = Math.max(0.01, seg.end_time - seg.start_time);
    const frac = Math.min(1, Math.max(0, (currentTime - seg.start_time) / span));
    fill.style.transition = "none";
    fill.style.transform = `scaleX(${frac})`;
    if (!playing) return;
    const remaining = Math.max(0, (seg.end_time - currentTime) / (rate || 1));
    const raf = requestAnimationFrame(() => {
      fill.style.transition = `transform ${remaining}s linear`;
      fill.style.transform = "scaleX(1)";
    });
    return () => cancelAnimationFrame(raf);
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
                className={["chord-cell", isActive && "playing", selected && "selected"]
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
                  border: selected ? "2px solid var(--accent)" : "1px solid #2c313a",
                  borderLeft: onMeasure
                    ? "3px solid var(--accent)"
                    : selected
                      ? "2px solid var(--accent)"
                      : "1px solid #2c313a",
                  background: isActive ? "#26303f" : "var(--panel)",
                }}
              >
                {onResizeCommit && (
                  <span
                    aria-label={`Resize start of ${chordLabel(s)}`}
                    draggable={false}
                    onPointerDown={(e) => startResize(i, "left", e)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize" }}
                  />
                )}
                <strong>{chordLabel(s)}</strong>
                <span className="muted slash-marks">{beatSlashMarks(beats)}</span>
                <span className="muted">{s.roman_numeral}</span>
                {onResizeCommit && (
                  <span
                    aria-label={`Resize end of ${chordLabel(s)}`}
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
