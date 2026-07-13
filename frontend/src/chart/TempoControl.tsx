import { useEffect, useState } from "react";

interface Props {
  bpm: number | null;
  onChange: (bpm: number) => void;
  busy: boolean;
}

const MIN_BPM = 21; // the lowest whole tempo the API accepts (it requires > 20)
const MAX_BPM = 400;

/** A tempo the API will take: a whole number inside the countable range. */
function clamp(bpm: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

/**
 * Set the tempo the chart is counted in — the BPM in the line above the player, edited in
 * place: click the number, type, and it saves on Enter or on clicking away.
 *
 * Beat trackers land an octave out often enough — a 74 BPM song read as 144 BPM, every
 * chord counted as eight beats instead of four — that the metrical level has to be the
 * player's call. Halving the tempo does not move a chord in time; it re-counts the beats
 * under it, so ÷2 and ×2 stay one click away, beside the input while you're editing.
 *
 * Tempo is a whole number here and on the server: a count you can tap out, not 143.6.
 */
export default function TempoControl({ bpm, onChange, busy }: Props) {
  const whole = bpm == null ? null : Math.round(bpm);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(whole == null ? "" : String(whole));

  // The server may hand back a tempo we didn't type (a ÷2, or another tab's edit).
  useEffect(() => {
    setDraft(whole == null ? "" : String(whole));
  }, [whole]);

  if (whole == null) return null; // no detected tempo yet — nothing to rescale from

  const commit = () => {
    setEditing(false);
    const parsed = Math.round(Number(draft));
    if (!draft.trim() || !Number.isFinite(parsed) || parsed < MIN_BPM || parsed > MAX_BPM) {
      setDraft(String(whole)); // reject: snap back to the real tempo
      return;
    }
    if (parsed !== whole) onChange(parsed);
    else setDraft(String(whole)); // e.g. a typed "72.4" is the tempo we already have
  };

  const rescale = (factor: number) => {
    setEditing(false);
    onChange(clamp(whole * factor));
  };

  if (!editing) {
    return (
      <button
        type="button"
        className="inline-edit"
        disabled={busy}
        aria-label={`Tempo: ${whole} BPM`}
        title="Click to set the tempo (re-counts the beats under each chord; the audio doesn't move)"
        onClick={() => setEditing(true)}
      >
        {whole} BPM
      </button>
    );
  }

  return (
    <span className="inline-edit inline-edit--editing">
      <input
        autoFocus
        aria-label="Tempo"
        type="number"
        min={MIN_BPM}
        max={MAX_BPM}
        step="1"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(String(whole));
            setEditing(false);
          }
        }}
      />
      <span className="muted">BPM</span>
      {/* Keep the pointer press off the input: blurring it would commit the draft and close
          the editor before the click ever landed on the button. These stay enabled while a
          save is in flight — `busy` goes up for any edit on the sheet, and disabling the
          control under the user's hands would take the focus with it. */}
      <button
        type="button"
        className="inline-edit__btn"
        title="Half-time"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => rescale(0.5)}
      >
        ÷2
      </button>
      <button
        type="button"
        className="inline-edit__btn"
        title="Double-time"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => rescale(2)}
      >
        ×2
      </button>
    </span>
  );
}
