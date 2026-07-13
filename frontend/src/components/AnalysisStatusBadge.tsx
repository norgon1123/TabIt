import type { AnalysisOut, ChartSummaryOut } from "../api/types";
import { formatDuration } from "../chart/timeMath";
import Spinner from "./Spinner";

const COLORS: Record<string, string> = {
  pending: "var(--muted)",
  running: "var(--accent)",
  done: "var(--ok)",
  failed: "var(--danger)",
};

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
    <span style={{ color: COLORS[status] ?? "var(--muted)", fontWeight: 600 }}>
      {inProgress && (
        <>
          <Spinner size={12} label={status} />{" "}
        </>
      )}
      {status}
      {durationSeconds != null && (
        <span className="muted" style={{ fontWeight: 400 }}> · {formatDuration(durationSeconds)}</span>
      )}
      {status === "done" && bpm != null && (
        <span className="muted" style={{ fontWeight: 400 }}>
          {" "}· {bpm} BPM · {tonic} {mode}
        </span>
      )}
      {analysis?.status === "failed" && analysis.error && (
        <span className="muted" style={{ fontWeight: 400 }}> · {analysis.error}</span>
      )}
    </span>
  );
}
