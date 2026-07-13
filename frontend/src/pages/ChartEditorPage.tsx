import { Link, useParams } from "react-router-dom";
import ChartSheet from "../chart/ChartSheet";
import { useRecording } from "../chart/useRecording";
import { useReanalyze } from "../chart/useReanalyze";
import Spinner from "../components/Spinner";

export default function ChartEditorPage() {
  const { recordingId } = useParams<{ recordingId: string }>();
  const id = recordingId!;
  const { recording, analysis, duration, inProgress, isLoading } = useRecording(id);
  const { reanalyze, isPending: reanalyzing } = useReanalyze(id);

  if (isLoading) return <p className="muted container">Loading...</p>;

  return (
    <div className="container">
      <p><Link to="/">&larr; Library</Link></p>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{recording?.original_filename ?? "Chart"}</h1>
        <button onClick={() => reanalyze()} disabled={reanalyzing || inProgress}>
          Re-analyze
        </button>
        {inProgress && (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }} className="muted">
            <Spinner label="Analyzing" /> Analyzing&hellip;
          </span>
        )}
      </div>

      <ChartSheet
        recordingId={id}
        audioSrc={`/api/recordings/${id}/audio`}
        analysis={analysis}
        duration={duration}
        inProgress={inProgress}
      />
    </div>
  );
}
