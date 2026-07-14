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
 *  never the only channel. */
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
