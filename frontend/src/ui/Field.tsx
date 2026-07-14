import type { ReactNode } from "react";

export interface FieldProps {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
}

/** A labelled control.
 *
 *  The <label> WRAPS the control rather than pointing at it with htmlFor. That is the
 *  pattern already in SegmentEditor, it needs no id, and an id that is missing or
 *  duplicated is the single most common way a form silently loses its accessible names.
 *
 *  The error is role="alert" so it is announced when it appears. A red border alone is
 *  invisible to a screen reader and ambiguous to a red-green colourblind user — colour is
 *  never the only channel.
 *
 *  role="alert" (assertive) is deliberate here and should NOT be softened to role="status"
 *  the way ChordGuess's wrong-guess message was. The rule is "answers may speak; nothing
 *  during playback may volunteer" — but a failed save is also a genuine error the user
 *  must not miss: it is rare, it is user-initiated (they clicked Save), and there is no
 *  song playing to talk over. A wrong practice guess is none of those things — it is
 *  routine, expected, and happens mid-playback — which is why that one is polite and this
 *  one stays assertive. */
export default function Field({ label, children, error, hint }: FieldProps) {
  return (
    <div className="field">
      <label className="field__label">
        <span className="field__name">{label}</span>
        {children}
      </label>
      {hint && <span className="field__hint muted">{hint}</span>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
