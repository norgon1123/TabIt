import { useEffect, useRef, useState } from "react";
import { MODES, MODE_LABELS, ROOTS } from "../api/music";
import type { ChartSettingsPatch } from "./useChart";

type Mode = (typeof MODES)[number];

interface Props {
  keyTonic: string;
  keyMode: string;
  onChange: (patch: ChartSettingsPatch) => void;
  busy: boolean;
}

/**
 * Correct the key, edited in place in the line above the player: the key reads as text
 * until you click it, then it is a tonic dropdown and a major/minor dropdown. Picking from
 * either saves immediately; clicking away or pressing Enter closes the editor.
 *
 * Changing the key never moves a chord — it re-reads the same chords against a new tonic,
 * so only the roman numerals change.
 */
export default function KeyControl({ keyTonic, keyMode, onChange, busy }: Props) {
  const [editing, setEditing] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);

  // Return focus to the trigger when the editor closes (Enter, Escape, or click-away) —
  // otherwise a keyboard user lands on document.body and has to Tab back from the top, the
  // same courtesy Panel extends via useReturnFocus. Deferred to a microtask so the Enter that
  // closes cannot re-activate the just-focused trigger and re-open the editor; the wasEditing
  // guard means it fires only on a real close, never on the initial mount.
  useEffect(() => {
    if (wasEditing.current && !editing) {
      const trigger = triggerRef.current;
      queueMicrotask(() => trigger?.focus());
    }
    wasEditing.current = editing;
  }, [editing]);

  // Close on the document, not on the dropdowns' own focus: a save re-renders the sheet,
  // and a widget that only listened to its own blur could be left open with no way back.
  useEffect(() => {
    if (!editing) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setEditing(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") setEditing(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [editing]);

  const label = `${keyTonic} ${MODE_LABELS[keyMode as Mode] ?? keyMode}`;

  if (!editing) {
    return (
      <button
        ref={triggerRef}
        type="button"
        className="inline-edit"
        disabled={busy}
        aria-label={`Key: ${label}`}
        title="Click to correct the key — the chords stay the same, the roman numerals update"
        onClick={() => setEditing(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <span
      ref={box}
      className="inline-edit inline-edit--editing"
      // Tabbing out of the pair closes it too — but not moving between the two dropdowns.
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node | null)) setEditing(false);
      }}
    >
      {/* Deliberately still enabled while a save is in flight: `busy` goes up for any edit
          anywhere on the sheet, and disabling the dropdown under the user's cursor would
          take the focus with it mid-pick. */}
      <select
        autoFocus
        aria-label="Key tonic"
        value={keyTonic}
        onChange={(e) => onChange({ key_tonic: e.target.value })}
      >
        {ROOTS.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
      <select
        aria-label="Key mode"
        value={keyMode}
        onChange={(e) => onChange({ key_mode: e.target.value })}
      >
        {MODES.map((m) => (
          <option key={m} value={m}>{MODE_LABELS[m]}</option>
        ))}
      </select>
    </span>
  );
}
