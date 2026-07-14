// frontend/src/chart/TimeSignatureControl.tsx
import type { ChartSettingsPatch } from "./useChart";
import Stack from "../ui/Stack";
import Button from "../ui/Button";

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
    <Stack className="card" gap={4} wrap>
      <Stack gap={2}>
        <span>Beats / measure: <strong>{beatsPerMeasure}</strong></span>
        <Button disabled={busy || beatsPerMeasure <= 1}
                onClick={() => onChange({ beats_per_measure: beatsPerMeasure - 1 })}>−</Button>
        <Button disabled={busy || beatsPerMeasure >= 16}
                onClick={() => onChange({ beats_per_measure: beatsPerMeasure + 1 })}>+</Button>
      </Stack>
      <Stack gap={2}>
        <span>Bar-line shift: <strong>{measureOffset}</strong></span>
        <Button disabled={busy || measureOffset <= 0}
                onClick={() => onChange({ measure_offset: measureOffset - 1 })}>◀</Button>
        <Button disabled={busy || measureOffset >= beatsPerMeasure - 1}
                onClick={() => onChange({ measure_offset: measureOffset + 1 })}>▶</Button>
      </Stack>
    </Stack>
  );
}
