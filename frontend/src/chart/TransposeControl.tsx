import Stack from "../ui/Stack";
import Button from "../ui/Button";

interface Props {
  onTranspose: (semitones: number) => void;
  busy: boolean;
}

export default function TransposeControl({ onTranspose, busy }: Props) {
  return (
    <Stack className="card" gap={2} wrap>
      <span>Transpose:</span>
      <Button onClick={() => onTranspose(-1)} disabled={busy}>−1</Button>
      <Button onClick={() => onTranspose(1)} disabled={busy}>+1</Button>
      <span className="muted">(move the chords — roman numerals stay the same)</span>
    </Stack>
  );
}
