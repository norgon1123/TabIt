import { Link, useParams, useSearchParams } from "react-router-dom";
import ChartSheet from "../chart/ChartSheet";
import { PlaybackProvider } from "../chart/PlaybackContext";
import ChartContextBar from "../chart/ChartContextBar";
import { useRecording } from "../chart/useRecording";
import { useReanalyze } from "../chart/useReanalyze";
import Spinner from "../components/Spinner";
import ModeChoice from "../practice/ModeChoice";
import Stack from "../ui/Stack";
import Button from "../ui/Button";
import { allowedMode, canPractice, type ChartMode } from "../practice/gate";
import { useAuth } from "../auth/AuthContext";

/** The mode lives in the URL, so it survives a reload and can be linked to. Anything else —
 *  no `mode`, or a value we don't serve — means the question has not been answered yet. */
function readMode(raw: string | null): ChartMode | null {
  if (raw === "practice") return "practice";
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
  // rather than quietly opening it: the gate decides who practises, not the URL.
  const mode = allowedMode(readMode(params.get("mode")), user);
  const choose = (next: ChartMode) =>
    setParams(
      (prev) => {
        // Set, don't replace: the mode is one param among whatever else the URL is carrying.
        prev.set("mode", next);
        return prev;
      },
      { replace: true },
    );
  const practice = mode === "practice";

  if (isLoading) return <p className="muted container">Loading...</p>;

  return (
    <PlaybackProvider>
      <div className="chart-page">
        <ChartContextBar
          title={recording?.original_filename ?? "Chart"}
          back={<Link to="/">&larr; Library</Link>}
          actions={
            <>
              {/* Re-analysis rewrites the chart from scratch, which mid-practice would swap
                  the questions out from under the player. It belongs to the editor. */}
              {mode === "edit" && (
                <Button onClick={() => reanalyze()} disabled={reanalyzing || inProgress}>
                  Re-analyze
                </Button>
              )}

              {mode && canPractice(user) && (
                <Button onClick={() => choose(practice ? "edit" : "practice")}>
                  {practice ? "Show the chords" : "Practice mode"}
                </Button>
              )}

              {inProgress && (
                <Stack gap={1} className="muted">
                  <Spinner label="Analyzing" /> Analyzing&hellip;
                </Stack>
              )}
            </>
          }
        />

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
    </PlaybackProvider>
  );
}
