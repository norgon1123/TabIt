import type { HTMLAttributes } from "react";

/** One of the six space tokens. Nothing may invent a gap. */
export type Space = 1 | 2 | 3 | 4 | 5 | 6;

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  direction?: "row" | "column";
  gap?: Space;
  align?: "start" | "center" | "baseline" | "stretch";
  justify?: "start" | "center" | "between";
  wrap?: boolean;
  as?: "div" | "nav" | "header" | "section";
}

/** The flex row/column, once.
 *
 *  `display:flex; gap:12; alignItems:center; flexWrap:wrap` was hand-written in at least
 *  five files before this existed. Spacing travels as DATA ATTRIBUTES, not inline styles,
 *  so the CSS keeps ownership of the actual pixel values — which is what lets a theme (and
 *  Phase 2's layout work) retarget a Stack without touching a single component. */
export default function Stack({
  direction = "row",
  gap = 3,
  align = "center",
  justify = "start",
  wrap = false,
  as: Tag = "div",
  className,
  ...rest
}: StackProps) {
  return (
    <Tag
      className={className ? `stack ${className}` : "stack"}
      data-direction={direction}
      data-gap={String(gap)}
      data-align={align}
      data-justify={justify}
      data-wrap={wrap ? "true" : undefined}
      {...rest}
    />
  );
}
