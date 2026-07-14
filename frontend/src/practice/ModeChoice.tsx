import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Card from "../ui/Card";
import Button from "../ui/Button";
import { PRACTICE_ACCESS, practiceLock, type ChartMode, type PracticeAccess } from "./gate";

export type { ChartMode };

/** The question every song is opened through: see the chords, or work them out?
 *
 * Guests are asked exactly as members are — the *answer* is where they can differ, and that
 * is `gate.ts`'s call, not this component's. When practice mode is locked, the option stays
 * on screen (disabled, with the reason) rather than vanishing: a feature nobody can see is a
 * feature nobody signs up for.
 *
 * `access` defaults to the shipped policy; it is a parameter only so a test can render the
 * locked door we do not currently ship.
 */
export default function ModeChoice({
  onChoose,
  access = PRACTICE_ACCESS,
}: {
  onChoose: (mode: ChartMode) => void;
  access?: PracticeAccess;
}) {
  const { user } = useAuth();
  const locked = practiceLock(user, access);

  return (
    <Card className="mode-choice">
      <h2 className="mode-choice__title">How do you want to open this song?</h2>
      <p className="muted mode-choice__subtitle">You can switch at any time.</p>

      <div className="mode-choice__options">
        <Button variant="primary" className="mode-choice__option" onClick={() => onChoose("edit")}>
          <strong>Open the chart</strong>
          <span>The chords, as Tabit heard them — play along, correct anything it got wrong.</span>
        </Button>

        <Button
          className="mode-choice__option"
          disabled={locked != null}
          aria-describedby={locked ? "practice-locked" : undefined}
          onClick={() => onChoose("practice")}
        >
          <strong>Practice mode</strong>
          <span>
            The chords are hidden. Listen, name each one, and it is revealed when you get it
            right.
          </span>
        </Button>
      </div>

      {locked && (
        <p id="practice-locked" className="muted mode-choice__locked">
          {locked} <Link to="/register">Create an account</Link>
        </p>
      )}
    </Card>
  );
}
