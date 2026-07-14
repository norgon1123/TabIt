import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import Button from "./Button";

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: string;
  children?: ReactNode;
  onClose?: () => void;
}

/** The panel that appears beside the chart — the segment editor, the practice guess.
 *
 *  role="group" + aria-label so that when focus lands inside it, a screen reader says
 *  what it is rather than reading out an unlabelled box of selects.
 *
 *  Forwards its ref to the root div: the practice guess (`ChordGuess`) needs the real DOM
 *  node to replay its shake animation on every wrong answer (remove the class, force a
 *  reflow, re-add it) without remounting the panel and dropping focus out of the form. */
const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { title, children, onClose, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      {...rest}
      role="group"
      aria-label={title}
      className={className ? `card chart-panel ${className}` : "card chart-panel"}
      data-padding="3"
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
});

export default Panel;
