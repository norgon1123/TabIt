import type { HTMLAttributes } from "react";
import type { Space } from "./Stack";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: Space;
}

/** A surface. Padding travels as a data attribute so the CSS keeps the pixels. */
export default function Card({ padding = 3, className, ...rest }: CardProps) {
  return (
    <div
      className={className ? `card ${className}` : "card"}
      data-padding={String(padding)}
      {...rest}
    />
  );
}
