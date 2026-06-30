import { useRef, useState } from "react";
import type { SegmentOut } from "../api/types";
import {
  boundaryUpdates,
  groupIntoLines,
  MEASURES_PER_LINE,
  reorderIds,
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
  selectedId: string | null;
  onSelect: (segmentId: string) => void;
  onSeek?: (time: number) => void;
  onResizeCommit?: (updates: SegmentUpdate[]) => void;
  // Round 2 #4: receives the full new left-to-right order after an insert-reorder.
  onReorder?: (orderedIds: string[]) => void;
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
  selectedId,
  onSelect,
  onSeek,
  onResizeCommit,
  onReorder,
}: Props) {
  const ordered = [...segments].sort((a, b) => a.start_beat - b.start_beat);
  const orderedIds = ordered.map((s) => s.id);
  const indexById = new Map(orderedIds.map((id, i) => [id, i] as const));
  const beatsPerLine = Math.max(1, beatsPerMeasure) * MEASURES_PER_LINE;
  const lines = groupIntoLines(ordered, beatsPerLine);
  const dragId = useRef<string | null>(null);
  // State drives the visual indicator; the ref is read synchronously on drop (state lags).
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  const suppressClick = useRef(false);

  function setDrop(idx: number | null) {
    dropIndexRef.current = idx;
    setDropIndex(idx);
  }

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

  function commitReorder() {
    const from = dragId.current;
    const at = dropIndexRef.current;
    if (onReorder && from && at != null) {
      const next = reorderIds(orderedIds, from, at);
      if (next.join(" ") !== orderedIds.join(" ")) onReorder(next);
    }
    dragId.current = null;
    setDrop(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {lines.map((line, li) => (
        <div key={li} style={{ display: "flex", justifyContent: "flex-start", gap: 0 }}>
          {line.map((s) => {
            const i = indexById.get(s.id)!;
            const selected = s.id === selectedId;
            const beats = Math.max(0.5, s.end_beat - s.start_beat);
            const playing = currentTime >= s.start_time && currentTime < s.end_time;
            const span = Math.max(0.01, s.end_time - s.start_time);
            // #2: how far the playhead has travelled through this chord, 0..1.
            const progress = playing
              ? Math.min(1, Math.max(0, (currentTime - s.start_time) / span))
              : 0;
            const onMeasure =
              Math.abs(((s.start_beat - measureOffset) % beatsPerMeasure)) < 1e-6;
            const dragging = dragId.current != null;
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                className={["chord-cell", playing && "playing", selected && "selected"]
                  .filter(Boolean)
                  .join(" ")}
                draggable={!!onReorder}
                data-segment-id={s.id}
                onDragStart={() => {
                  dragId.current = s.id;
                }}
                onDragOver={(e) => {
                  if (!onReorder || !dragId.current) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const after = e.clientX - rect.left > rect.width / 2;
                  setDrop(i + (after ? 1 : 0));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  commitReorder();
                }}
                onDragEnd={() => {
                  dragId.current = null;
                  setDrop(null);
                }}
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
                  borderLeft: onMeasure ? "3px solid var(--accent)" : selected ? "2px solid var(--accent)" : "1px solid #2c313a",
                  background: playing ? "#26303f" : "var(--panel)",
                }}
              >
                {/* #4: pulsing blue line previewing where the dragged chord will land. */}
                {dragging && dropIndex === i && (
                  <span aria-hidden className="drop-indicator" style={{ left: -1.5 }} />
                )}
                {dragging && dropIndex === i + 1 && (
                  <span aria-hidden className="drop-indicator" style={{ right: -1.5 }} />
                )}
                {onResizeCommit && (
                  <span
                    aria-label={`Resize start of ${chordLabel(s)}`}
                    draggable={false}
                    onPointerDown={(e) => startResize(i, "left", e)}
                    onClick={(e) => e.stopPropagation()}
                    onDragStart={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
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
                    onDragStart={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize" }}
                  />
                )}
                {playing && (
                  <span
                    aria-hidden
                    className="chord-progress"
                    style={{
                      position: "absolute",
                      left: 0,
                      bottom: 0,
                      height: 4,
                      width: `${progress * 100}%`,
                      background: "var(--accent)",
                      transition: "width 0.1s linear",
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
