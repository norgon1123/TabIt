import { useRef } from "react";
import type { SegmentOut } from "../api/types";
import { boundaryUpdates, chordsPerLine, type SegmentUpdate } from "./chartLayout";
import { clampBoundary } from "./timeMath";

export type { SegmentUpdate };

interface Props {
  segments: SegmentOut[];
  bpm: number | null;
  duration: number;
  currentTime: number;
  selectedId: string | null;
  onSelect: (segmentId: string) => void;
  onSeek?: (time: number) => void;
  onResizeCommit?: (updates: SegmentUpdate[]) => void;
  onSwap?: (aId: string, bId: string) => void;
}

// Horizontal pointer movement → time, since cell width no longer encodes duration.
const SECONDS_PER_PIXEL = 0.02;

function chordLabel(s: SegmentOut): string {
  const q = s.chord_quality === "maj" ? "" : s.chord_quality === "min" ? "m" : s.chord_quality;
  return `${s.chord_root}${q}`;
}

export default function Timeline({
  segments,
  bpm,
  duration,
  currentTime,
  selectedId,
  onSelect,
  onSeek,
  onResizeCommit,
  onSwap,
}: Props) {
  const ordered = [...segments].sort((a, b) => a.start_time - b.start_time);
  const perLine = chordsPerLine(bpm);
  const dragId = useRef<string | null>(null);
  const suppressClick = useRef(false);

  function startResize(index: number, edge: "left" | "right", e: React.PointerEvent) {
    e.stopPropagation();
    suppressClick.current = false;
    if (!onResizeCommit) return;
    const seg = ordered[index];
    const left = edge === "left" ? ordered[index - 1] : seg;
    const right = edge === "left" ? seg : ordered[index + 1];
    const oldBoundary = edge === "left" ? seg.start_time : seg.end_time;
    const lower = left ? left.start_time : 0;
    const upper = right ? right.end_time : duration || seg.end_time;
    const startX = e.clientX;

    const move = (ev: PointerEvent) => {
      ev.preventDefault();
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      suppressClick.current = true;
      const dt = (ev.clientX - startX) * SECONDS_PER_PIXEL;
      const boundary = clampBoundary(oldBoundary + dt, lower, upper);
      const updates = boundaryUpdates(left, right, oldBoundary, boundary);
      if (updates.length) onResizeCommit(updates);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-start", gap: 0 }}>
      {ordered.map((s, i) => {
        const selected = s.id === selectedId;
        const playing = currentTime >= s.start_time && currentTime < s.end_time;
        return (
          <div
            key={s.id}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            className={["chord-cell", playing && "playing", selected && "selected"].filter(Boolean).join(" ")}
            draggable={!!onSwap}
            data-segment-id={s.id}
            onDragStart={() => {
              dragId.current = s.id;
            }}
            onDragOver={(e) => onSwap && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (onSwap && dragId.current && dragId.current !== s.id) {
                onSwap(dragId.current, s.id);
              }
              dragId.current = null;
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
              flex: `0 0 ${100 / perLine}%`,
              minWidth: 56,
              height: 64,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              overflow: "hidden",
              border: selected ? "2px solid var(--accent)" : "1px solid #2c313a",
              background: playing ? "#26303f" : "var(--panel)",
              boxShadow: playing ? "inset 0 -3px 0 var(--accent)" : "none",
            }}
          >
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
          </div>
        );
      })}
    </div>
  );
}
