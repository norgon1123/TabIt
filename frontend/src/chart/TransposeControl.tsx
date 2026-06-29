interface Props {
  keyLabel: string;
  onTranspose: (semitones: number) => void;
  busy: boolean;
}

export default function TransposeControl({ keyLabel, onTranspose, busy }: Props) {
  return (
    <div className="card" style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span>Key: <strong>{keyLabel}</strong></span>
      <button onClick={() => onTranspose(-1)} disabled={busy}>−1</button>
      <button onClick={() => onTranspose(1)} disabled={busy}>+1</button>
      <span className="muted">(transpose — roman numerals stay the same)</span>
    </div>
  );
}
