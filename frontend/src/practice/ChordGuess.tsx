import { useEffect, useRef, useState } from "react";
import type { SegmentOut } from "../api/types";
import { ROOTS, QUALITIES, QUALITY_LABELS, chordLabel } from "../api/music";
import { isCorrectGuess } from "./answer";
import Panel from "../ui/Panel";
import Field from "../ui/Field";
import Button from "../ui/Button";

/** How long the correct answer stays up, in green, before the form dismisses itself. */
const REVEAL_MS = 700;

type Verdict = "idle" | "wrong" | "right";

interface Props {
  segment: SegmentOut;
  /** Already named — in this sitting, or a moment ago. The form has nothing left to ask. */
  solved?: boolean;
  /** The player got it. Fired the instant they submit, not when the flash ends. */
  onSolved: (segmentId: string) => void;
  onClose?: () => void;
  revealMs?: number;
}

/** Name that chord — the only way a masked chord opens up in practice mode.
 *
 * A wrong answer shakes the form red and leaves it standing, fields untouched, so the next
 * attempt is one click away. A right answer flashes green and then gets out of the way,
 * handing the chord back to the chart to display.
 *
 * The solve is reported the moment it is submitted; the green flash is a nicety played out
 * over a chord that has *already* been named. Deferring the reveal to the end of the flash
 * loses it for a player who does the natural thing and clicks straight on to the next "?" —
 * this form unmounts and the chord they just got right goes back to being a question.
 */
export default function ChordGuess({
  segment,
  solved = false,
  onSolved,
  onClose,
  revealMs = REVEAL_MS,
}: Props) {
  const [root, setRoot] = useState(ROOTS[0]);
  const [quality, setQuality] = useState<string>(QUALITIES[0]);
  const [verdict, setVerdict] = useState<Verdict>("idle");
  const [misses, setMisses] = useState(0);
  const card = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | null>(null);

  // Moving to another chord is a fresh question: never carry a verdict (or a pending reveal)
  // from the chord before it.
  useEffect(() => {
    setVerdict("idle");
    setMisses(0);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [segment.id]);

  // Replay the shake on *every* wrong answer, not just the first. CSS only restarts an
  // animation when the class is freshly applied, so the class is re-applied around a forced
  // reflow — and it has to happen after React has committed its own `className` write, or
  // that write would drop the class the same tick it went on.
  useEffect(() => {
    const el = card.current;
    if (!el || misses === 0) return;
    el.classList.remove("shake");
    void el.offsetWidth; // reflow: the removal has to land before the re-add
    el.classList.add("shake");
  }, [misses]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (verdict === "right") return; // already named; the form is just seeing itself out

    if (!isCorrectGuess({ root, quality }, segment)) {
      setVerdict("wrong");
      setMisses((n) => n + 1);
      return;
    }

    // Named: banked on the chart now, so nothing about it depends on the player sitting
    // still through the flash. The timer only dismisses the form.
    setVerdict("right");
    onSolved(segment.id);
    timer.current = window.setTimeout(() => onClose?.(), revealMs);
  }

  // A chord named earlier in the sitting: say so, rather than selecting into a dead end or
  // asking a question whose answer is on screen behind the panel.
  if (solved && verdict !== "right") {
    return (
      <Panel
        ref={card}
        title={chordLabel(segment.chord_root, segment.chord_quality)}
        onClose={onClose}
        className="chord-guess"
      >
        <p className="muted">You named this one.</p>
      </Panel>
    );
  }

  return (
    <Panel
      ref={card}
      title="Name that chord"
      onClose={onClose}
      className={[
        "chord-guess",
        verdict === "wrong" && "chord-guess--wrong",
        verdict === "right" && "chord-guess--right",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <form onSubmit={submit}>
        <Field label="Root">
          <select
            aria-invalid={verdict === "wrong"}
            value={root}
            disabled={verdict === "right"}
            onChange={(e) => {
              setRoot(e.target.value);
              setVerdict("idle");
            }}
          >
            {ROOTS.map((r) => (<option key={r} value={r}>{r}</option>))}
          </select>
        </Field>
        <Field label="Quality">
          <select
            aria-invalid={verdict === "wrong"}
            value={quality}
            disabled={verdict === "right"}
            onChange={(e) => {
              setQuality(e.target.value);
              setVerdict("idle");
            }}
          >
            {QUALITIES.map((q) => (<option key={q} value={q}>{QUALITY_LABELS[q]}</option>))}
          </select>
        </Field>

        {verdict === "wrong" && (
          <p className="error" role="alert">
            Not that one — listen again and try another.
          </p>
        )}
        {verdict === "right" && (
          <p className="ok" role="status">
            {chordLabel(segment.chord_root, segment.chord_quality)} — that's it.
          </p>
        )}

        <Button variant="primary" type="submit" disabled={verdict === "right"}>
          Submit
        </Button>
      </form>
    </Panel>
  );
}
