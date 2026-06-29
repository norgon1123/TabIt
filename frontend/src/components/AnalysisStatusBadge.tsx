import type { AnalysisOut } from "../api/types";

const COLORS: Record<string, string> = {
  pending: "var(--muted)",
  running: "var(--accent)",
  done: "var(--ok)",
  failed: "var(--danger)",
};

export default function AnalysisStatusBadge({ analysis }: { analysis: AnalysisOut | null }) {
  const status = analysis?.status ?? "pending";
  return (
    <span style={{ color: COLORS[status] ?? "var(--muted)", fontWeight: 600 }}>
      {status}
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
