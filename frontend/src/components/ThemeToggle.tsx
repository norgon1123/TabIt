import { useTheme } from "../theme/ThemeContext";
import Button from "../ui/Button";

/** The label says what pressing the button DOES, not what the current state IS.
 *  "Dark mode" is ambiguous read aloud — a screen-reader user cannot tell whether it is
 *  reporting a state or offering an action. The glyph is decorative and hidden from the
 *  accessibility tree; the name carries the meaning. */
export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <Button variant="icon" onClick={toggle} aria-label={`Switch to ${next} mode`}>
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
    </Button>
  );
}
