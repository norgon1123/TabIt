export default function Spinner({
  label = "Loading",
  announce = true,
}: {
  label?: string;
  /** Whether this spinner is allowed to speak. During playback the user is listening, and a
   *  live region competes with the music for the same channel — pass `false` there. The
   *  spinner still renders; it just carries no `role`, so it stops being announced. */
  announce?: boolean;
}) {
  return <span role={announce ? "status" : undefined} aria-label={label} className="spinner" />;
}
