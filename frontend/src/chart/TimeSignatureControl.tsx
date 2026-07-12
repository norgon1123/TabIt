// frontend/src/chart/TimeSignatureControl.tsx
import type { ChartSettingsPatch } from "./useChart";

interface Props {
  beatsPerMeasure: number;
  measureOffset: number;
  onChange: (patch: ChartSettingsPatch) => void;
  busy: boolean;
}

export default function TimeSignatureControl({
  beatsPerMeasure,
  measureOffset,
  onChange,
  busy,
}: Props) {
  return (
    <div className="card" style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span>Beats / measure: <strong>{beatsPerMeasure}</strong></span>
      <button disabled={busy || beatsPerMeasure <= 1}
              onClick={() => onChange({ beats_per_measure: beatsPerMeasure - 1 })}>−</button>
      <button disabled={busy || beatsPerMeasure >= 16}
              onClick={() => onChange({ beats_per_measure: beatsPerMeasure + 1 })}>+</button>
      <span style={{ marginLeft: 12 }}>Bar-line shift: <strong>{measureOffset}</strong></span>
      <button disabled={busy || measureOffset <= 0}
              onClick={() => onChange({ measure_offset: measureOffset - 1 })}>◀</button>
      <button disabled={busy || measureOffset >= beatsPerMeasure - 1}
              onClick={() => onChange({ measure_offset: measureOffset + 1 })}>▶</button>
    </div>
  );
}
