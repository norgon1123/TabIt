import type { HTMLAttributes, ReactNode } from "react";
import Button from "./Button";

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: string;
  children?: ReactNode;
  onClose?: () => void;
  /** Measured px offset from the top of the chart area, so the panel lines up with the
   *  chord's row. Runtime geometry, not a design value — it stays inline. Phase 2
   *  replaces this whole mechanism with a docked panel; do not try to tokenise it. */
  top?: number;
}

/** The panel that appears beside the chart — the segment editor, the practice guess.
 *
 *  role="group" + aria-label so that when focus lands inside it, a screen reader says
 *  what it is rather than reading out an unlabelled box of selects. */
export default function Panel({ title, children, onClose, top, className, ...rest }: PanelProps) {
  return (
    <div
      role="group"
      aria-label={title}
      className={className ? `card chart-panel ${className}` : "card chart-panel"}
      data-padding="3"
      style={top === undefined ? undefined : { top }}
      {...rest}
    >
      <div className="panel__head">
        <strong>{title}</strong>
        {onClose && (
          <Button variant="icon" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
            <span aria-hidden="true">&times;</span>
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}
