import type { AnalysisOut, ChartSummaryOut } from "../api/types";
import { formatDuration } from "../chart/timeMath";
import Spinner from "./Spinner";

export default function AnalysisStatusBadge({
  analysis,
  chart,
  durationSeconds,
}: {
  analysis: AnalysisOut | null;
  chart?: ChartSummaryOut | null;
  durationSeconds?: number | null;
}) {
  const status = analysis?.status ?? "pending";
  const inProgress = status === "pending" || status === "running";
  // Show the player their own tempo and key, not the engine's first guess — the same
  // fallback the chart sheet applies, so a song reads the same in both places.
  const bpm = chart?.bpm ?? analysis?.bpm ?? null;
  const tonic = chart?.key_tonic ?? analysis?.detected_key_tonic;
  const mode = chart?.key_mode ?? analysis?.detected_key_mode;
  return (
    // Colour is SUPPLEMENTARY here — the status word always renders alongside it, so the
    // `status--*` class (not an inline colour) is what a colourblind user does not need.
    <span className={`status status--${status}`}>
      {inProgress && (
        <>
          <Spinner label={status} />{" "}
        </>
      )}
      {status}
      {durationSeconds != null && (
        <span className="status__meta muted"> · {formatDuration(durationSeconds)}</span>
      )}
      {status === "done" && bpm != null && (
        <span className="status__meta muted">
          {" "}· {bpm} BPM · {tonic} {mode}
        </span>
      )}
      {analysis?.status === "failed" && analysis.error && (
        <span className="status__meta muted"> · {analysis.error}</span>
      )}
    </span>
  );
}
