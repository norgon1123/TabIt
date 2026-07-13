import { useEffect, useState } from "react";

interface Props {
  bpm: number | null;
  onChange: (bpm: number) => void;
  busy: boolean;
}

const MIN_BPM = 20;
const MAX_BPM = 400;

function clamp(bpm: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM + 0.01, bpm));
}

/**
 * Set the tempo the chart is counted in.
 *
 * Beat trackers land an octave out often enough — a 74 BPM song read as 143 BPM, every
 * chord counted as eight beats instead of four — that the metrical level has to be the
 * player's call. Halving the tempo does not move a chord in time; it re-counts the beats
 * under it, so ÷2 and ×2 are the two buttons that matter and get their own shortcuts.
 */
export default function TempoControl({ bpm, onChange, busy }: Props) {
  const [draft, setDraft] = useState(bpm == null ? "" : String(Math.round(bpm * 10) / 10));

  // The server may hand back a tempo we didn't type (a ÷2, or another tab's edit).
  useEffect(() => {
    setDraft(bpm == null ? "" : String(Math.round(bpm * 10) / 10));
  }, [bpm]);

  if (bpm == null) return null; // no detected tempo yet — nothing to rescale from

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed <= MIN_BPM || parsed > MAX_BPM) {
      setDraft(String(Math.round(bpm * 10) / 10)); // reject: snap back to the real tempo
      return;
    }
    if (Math.abs(parsed - bpm) > 0.005) onChange(parsed);
  };

  return (
    <div className="card" style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <label htmlFor="tempo-bpm">Tempo:</label>
      <input
        id="tempo-bpm"
        type="number"
        min={MIN_BPM}
        max={MAX_BPM}
        step="0.1"
        value={draft}
        disabled={busy}
        style={{ width: 80 }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(String(Math.round(bpm * 10) / 10));
        }}
      />
      <span className="muted">BPM</span>
      <button onClick={() => onChange(clamp(bpm / 2))} disabled={busy} title="Half-time">
        ÷2
      </button>
      <button onClick={() => onChange(clamp(bpm * 2))} disabled={busy} title="Double-time">
        ×2
      </button>
      <span className="muted">(re-counts the beats under each chord; the audio doesn't move)</span>
    </div>
  );
}
