import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "default" | "primary" | "danger" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** Every button in Tabit.
 *
 *  Two things are built in HERE so that no call site has to remember them:
 *
 *  1. `type="button"` by default. HTML's default is "submit", which means a stray button
 *     inside the login form submits it. Opt into "submit" explicitly.
 *  2. The variant is a CLASS. An inline style could not respond to a theme, and the
 *     focus-visible ring is defined once in CSS rather than 20 times in JSX. */
export default function Button({
  variant = "default",
  type = "button",
  className,
  ...rest
}: ButtonProps) {
  const classes = [variant === "default" ? null : variant, className]
    .filter(Boolean)
    .join(" ");

  return <button type={type} className={classes || undefined} {...rest} />;
}
