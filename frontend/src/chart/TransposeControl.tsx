interface Props {
  onTranspose: (semitones: number) => void;
  busy: boolean;
}

export default function TransposeControl({ onTranspose, busy }: Props) {
  return (
    <div className="card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span>Transpose:</span>
      <button onClick={() => onTranspose(-1)} disabled={busy}>−1</button>
      <button onClick={() => onTranspose(1)} disabled={busy}>+1</button>
      <span className="muted">(move the chords — roman numerals stay the same)</span>
    </div>
  );
}
