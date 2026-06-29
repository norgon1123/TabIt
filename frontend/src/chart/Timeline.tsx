import type { SegmentOut } from "../api/types";

interface Props {
  segments: SegmentOut[];
  duration: number;
  currentTime: number;
  selectedId: string | null;
  onSelect: (segmentId: string) => void;
}

export default function Timeline({ segments, duration, currentTime, selectedId, onSelect }: Props) {
  const span = duration > 0 ? duration : Math.max(1, ...segments.map((s) => s.end_time));
  const playheadPct = Math.min(100, (currentTime / span) * 100);

  return (
    <div style={{ position: "relative", display: "flex", width: "100%", height: 72, gap: 2 }}>
      {segments.map((s) => {
        const widthPct = ((s.end_time - s.start_time) / span) * 100;
        const selected = s.id === selectedId;
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            style={{
              flex: `0 0 ${widthPct}%`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              border: selected ? "2px solid var(--accent)" : "1px solid #2c313a",
              background: selected ? "#26303f" : "var(--panel)",
            }}
          >
            <strong>{s.chord_root}{s.chord_quality === "maj" ? "" : s.chord_quality === "min" ? "m" : s.chord_quality}</strong>
            <span className="muted">{s.roman_numeral}</span>
          </button>
        );
      })}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${playheadPct}%`,
          width: 2,
          background: "var(--accent)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
