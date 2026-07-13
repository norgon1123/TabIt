import { useEffect, useRef, useState } from "react";
import type { SegmentOut, SegmentWindowInput } from "../api/types";
import type { SegmentPatch } from "./useChart";
import { ROOTS, QUALITIES, QUALITY_LABELS } from "../api/music";
import { redistributeLength } from "./chartLayout";

interface Props {
  segment: SegmentOut;
  allSegments: SegmentOut[];
  maxTotalBeats: number;
  onResize: (windows: SegmentWindowInput[]) => void;
  onSave: (patch: SegmentPatch) => Promise<void>;
  onDelete: () => void;
  busy: boolean;
  debounceMs?: number;
}

export default function SegmentEditor({
  segment,
  allSegments,
  maxTotalBeats,
  onResize,
  onSave,
  onDelete,
  busy,
  debounceMs = 400,
}: Props) {
  const [root, setRoot] = useState(segment.chord_root);
  const [quality, setQuality] = useState(segment.chord_quality);
  const [beats, setBeats] = useState(segment.end_beat - segment.start_beat);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  // Each field re-seeds from the server values that feed *it*, and no others. Re-counting the
  // tempo (or resizing a neighbour) rewrites every segment's beats while leaving its chord
  // alone: if that also reset the chord selects, it would quietly undo the chord the player
  // had picked but not yet saved, and Save would PATCH the old chord straight back — a 200
  // that changes nothing and leaves the chord sheet looking stuck.
  useEffect(() => {
    setRoot(segment.chord_root);
    setQuality(segment.chord_quality);
    setError(null);
  }, [segment.id, segment.chord_root, segment.chord_quality]);

  useEffect(() => {
    setBeats(segment.end_beat - segment.start_beat);
  }, [segment.id, segment.start_beat, segment.end_beat]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, [segment.id]);

  function changeBeats(value: number) {
    setBeats(value);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const ordered = [...allSegments].sort((a, b) => a.start_beat - b.start_beat);
      const index = ordered.findIndex((s) => s.id === segment.id);
      if (index < 0) return;
      const windows = redistributeLength(ordered, index, value, maxTotalBeats);
      onResize(
        windows.map((w, i) => ({
          id: ordered[i].id,
          start_beat: w.start_beat,
          end_beat: w.end_beat,
        })),
      );
    }, debounceMs);
  }

  async function saveChord() {
    setError(null);
    try {
      await onSave({ chord_root: root, chord_quality: quality });
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
          onChange={(e) => changeBeats(Number(e.target.value))}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="primary" onClick={saveChord} disabled={busy}>Save</button>
        <button className="danger" onClick={onDelete} disabled={busy}>Delete</button>
      </div>
    </div>
  );
}
