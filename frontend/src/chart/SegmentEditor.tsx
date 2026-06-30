import { useEffect, useState } from "react";
import type { SegmentOut } from "../api/types";
import type { SegmentPatch } from "./useChart";
import { ROOTS, QUALITIES, QUALITY_LABELS } from "../api/music";
import { snapHalfBeat } from "./beatMath";

interface Props {
  segment: SegmentOut;
  onSave: (patch: SegmentPatch) => Promise<void>;
  onDelete: () => void;
  busy: boolean;
}

export default function SegmentEditor({ segment, onSave, onDelete, busy }: Props) {
  const [root, setRoot] = useState(segment.chord_root);
  const [quality, setQuality] = useState(segment.chord_quality);
  const [beats, setBeats] = useState(segment.end_beat - segment.start_beat);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRoot(segment.chord_root);
    setQuality(segment.chord_quality);
    setBeats(segment.end_beat - segment.start_beat);
    setError(null);
  }, [segment.id, segment.chord_root, segment.chord_quality, segment.start_beat, segment.end_beat]);

  async function save() {
    setError(null);
    try {
      const length = Math.max(0.5, snapHalfBeat(beats));
      await onSave({
        chord_root: root,
        chord_quality: quality,
        end_beat: snapHalfBeat(segment.start_beat + length),
      });
    } catch (err) {
      const detail = (err as { detail?: string }).detail;
      setError(detail ?? "Could not save segment");
    }
  }

  return (
    <div className="card" style={{ display: "grid", gap: 8 }}>
      <strong>Edit segment</strong>
      <label>
        Root
        <select value={root} onChange={(e) => setRoot(e.target.value)}>
          {ROOTS.map((r) => (<option key={r} value={r}>{r}</option>))}
        </select>
      </label>
      <label>
        Quality
        <select value={quality} onChange={(e) => setQuality(e.target.value)}>
          {QUALITIES.map((q) => (<option key={q} value={q}>{QUALITY_LABELS[q]}</option>))}
        </select>
      </label>
      <label>
        Beats
        <input
          type="number"
          step="0.5"
          min="0.5"
          value={beats}
          onChange={(e) => setBeats(Number(e.target.value))}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="primary" onClick={save} disabled={busy}>Save</button>
        <button className="danger" onClick={onDelete} disabled={busy}>Delete</button>
      </div>
    </div>
  );
}
