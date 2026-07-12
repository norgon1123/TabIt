import { MODES, MODE_LABELS, ROOTS } from "../api/music";
import type { ChartSettingsPatch } from "./useChart";

interface Props {
  keyTonic: string;
  keyMode: string;
  onChange: (patch: ChartSettingsPatch) => void;
  busy: boolean;
}

export default function KeyControl({ keyTonic, keyMode, onChange, busy }: Props) {
  return (
    <div className="card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span>Key:</span>
      <select
        aria-label="Key tonic"
        value={keyTonic}
        disabled={busy}
        onChange={(e) => onChange({ key_tonic: e.target.value })}
      >
        {ROOTS.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <select
        aria-label="Key mode"
        value={keyMode}
        disabled={busy}
        onChange={(e) => onChange({ key_mode: e.target.value })}
      >
        {MODES.map((m) => (
          <option key={m} value={m}>{MODE_LABELS[m]}</option>
        ))}
      </select>
      <span className="muted">(correct the key — chords stay the same, roman numerals update)</span>
    </div>
  );
}
