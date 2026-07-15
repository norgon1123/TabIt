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
      {/* The visible "−1"/"+1" is kept inside the accessible name (WCAG 2.5.3, Label in Name)
          while the words say what it does. */}
      <Button aria-label="Transpose down a semitone (−1)" onClick={() => onTranspose(-1)} disabled={busy}>−1</Button>
      <Button aria-label="Transpose up a semitone (+1)" onClick={() => onTranspose(1)} disabled={busy}>+1</Button>
      <span className="muted">(move the chords — roman numerals stay the same)</span>
    </Stack>
  );
}
