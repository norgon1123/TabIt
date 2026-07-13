import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { PRACTICE_ACCESS, practiceLock, type PracticeAccess } from "./gate";

export type ChartMode = "edit" | "practice";

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
    <div className="card mode-choice" style={{ marginTop: 16 }}>
      <h2 style={{ margin: "0 0 4px" }}>How do you want to open this song?</h2>
      <p className="muted" style={{ margin: "0 0 16px" }}>
        You can switch at any time.
      </p>

      <div className="mode-choice__options">
        <button className="mode-choice__option primary" onClick={() => onChoose("edit")}>
          <strong>Open the chart</strong>
          <span>The chords, as Tabit heard them — play along, correct anything it got wrong.</span>
        </button>

        <button
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
        </button>
      </div>

      {locked && (
        <p id="practice-locked" className="muted" style={{ margin: "12px 0 0" }}>
          {locked} <Link to="/register">Create an account</Link>
        </p>
      )}
    </div>
  );
}
