import type { AnalysisOut } from "../api/types";
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
  durationSeconds,
}: {
  analysis: AnalysisOut | null;
  durationSeconds?: number | null;
}) {
  const status = analysis?.status ?? "pending";
  const inProgress = status === "pending" || status === "running";
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
      {analysis?.status === "done" && analysis.bpm != null && (
        <span className="muted" style={{ fontWeight: 400 }}>
          {" "}· {Math.round(analysis.bpm)} BPM · {analysis.detected_key_tonic} {analysis.detected_key_mode}
        </span>
      )}
      {analysis?.status === "failed" && analysis.error && (
        <span className="muted" style={{ fontWeight: 400 }}> · {analysis.error}</span>
      )}
    </span>
  );
}
