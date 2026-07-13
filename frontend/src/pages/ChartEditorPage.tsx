import { Link, useParams, useSearchParams } from "react-router-dom";
import ChartSheet from "../chart/ChartSheet";
import { useRecording } from "../chart/useRecording";
import { useReanalyze } from "../chart/useReanalyze";
import Spinner from "../components/Spinner";
import ModeChoice, { type ChartMode } from "../practice/ModeChoice";
import { canPractice } from "../practice/gate";
import { useAuth } from "../auth/AuthContext";

/** The mode lives in the URL, so it survives a reload and can be linked to. Anything else —
 *  no `mode`, or a value we don't serve — means the question has not been answered yet. */
function readMode(raw: string | null, allowPractice: boolean): ChartMode | null {
  if (raw === "practice") return allowPractice ? "practice" : null;
  return raw === "edit" ? "edit" : null;
}

export default function ChartEditorPage() {
  const { recordingId } = useParams<{ recordingId: string }>();
  const id = recordingId!;
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { recording, analysis, duration, inProgress, isLoading } = useRecording(id);
  const { reanalyze, isPending: reanalyzing } = useReanalyze(id);

  // A `?mode=practice` link that arrives once the feature is locked lands on the chooser
  // rather than quietly opening the editor: the gate decides who practises, not the URL.
  const mode = readMode(params.get("mode"), canPractice(user));
  const choose = (next: ChartMode) => setParams({ mode: next }, { replace: true });
  const practice = mode === "practice";

  if (isLoading) return <p className="muted container">Loading...</p>;

  return (
    <div className="container">
      <p><Link to="/">&larr; Library</Link></p>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{recording?.original_filename ?? "Chart"}</h1>

        {/* Re-analysis rewrites the chart from scratch, which mid-practice would swap the
            questions out from under the player. It belongs to the editor. */}
        {mode === "edit" && (
          <button onClick={() => reanalyze()} disabled={reanalyzing || inProgress}>
            Re-analyze
          </button>
        )}

        {mode && canPractice(user) && (
          <button onClick={() => choose(practice ? "edit" : "practice")}>
            {practice ? "Show the chords" : "Practice mode"}
          </button>
        )}

        {inProgress && (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }} className="muted">
            <Spinner label="Analyzing" /> Analyzing&hellip;
          </span>
        )}
      </div>

      {mode == null ? (
        <ModeChoice onChoose={choose} />
      ) : (
        <ChartSheet
          recordingId={id}
          audioSrc={`/api/recordings/${id}/audio`}
          analysis={analysis}
          duration={duration}
          inProgress={inProgress}
          practice={practice}
        />
      )}
    </div>
  );
}
