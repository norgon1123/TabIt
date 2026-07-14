import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ChartSheet from "../chart/ChartSheet";
import { PlaybackProvider } from "../chart/PlaybackContext";
import { useRecording } from "../chart/useRecording";
import { useGuestSong } from "../guest/useGuestSong";
import UploadDropzone from "../library/UploadDropzone";
import AnalyzingIndicator from "../chart/AnalyzingIndicator";
import ModeChoice from "../practice/ModeChoice";
import Stack from "../ui/Stack";
import Button from "../ui/Button";
import { allowedMode, canPractice, type ChartMode } from "../practice/gate";
import { useAuth } from "../auth/AuthContext";

/** Tabit without an account: upload a song, and its chord sheet appears right below.
 *
 * One song at a time, held in memory on the server and gone from disk the moment analysis
 * ends — uploading another simply replaces it. The chart itself is the same component a
 * signed-in user edits.
 *
 * A guest is asked the same question a member is — chart, or practice? — while the analysis
 * is still running, so answering it costs no time. Whether practice is *theirs to pick* is
 * `practice/gate.ts`'s call, and this page does not second-guess it.
 */
export default function GuestHomePage() {
  const { recordingId, songKey, audioUrl, filename, upload, analyzeAgain, isUploading, uploadError } =
    useGuestSong();
  const { analysis, duration, inProgress } = useRecording(recordingId);
  const { user } = useAuth();
  const busy = isUploading || inProgress;

  // The mode is per-song, and a re-analysis is not a new song — it mints a new recording id
  // for the same one, and re-asking the question there would throw away the chart the visitor
  // is looking at. Key on the song, not the id.
  const [mode, setMode] = useState<ChartMode | null>(null);
  useEffect(() => setMode(null), [songKey]);
  // Every route into a mode goes through the gate, here as on the editor page: the disabled
  // button in the chooser is the manners, this is the lock.
  const choose = (next: ChartMode) => setMode(allowedMode(next, user));
  const practice = mode === "practice";

  return (
    <div className="container guest-home">
      <h1>Turn a recording into a chord chart</h1>
      <p className="muted">
        Drop in a practice recording and Tabit works out the tempo, key and chords. No account
        needed — your song is analyzed and then deleted from our server; we never store it.
      </p>

      <UploadDropzone
        onUpload={upload}
        busy={busy}
        hint="m4a, mp3 or wav · up to 10 minutes · one song at a time"
      />

      {uploadError && (
        <p className="error" role="alert">
          {uploadError}
        </p>
      )}

      {recordingId && audioUrl && (
        // AnalyzingIndicator (below, in the Stack) calls usePlayback() and can be on screen
        // before a mode is chosen and ChartSheet exists — so the provider has to wrap this
        // whole block, not just ChartSheet, or it throws outside its context.
        <PlaybackProvider>
          <div className="guest-chart">
            <Stack gap={3} wrap>
              <h2 className="no-margin">{filename ?? "Chart"}</h2>

              {/* Re-analysis re-cuts the chart, which mid-practice would swap the questions
                  out from under the player. It belongs to the chart. */}
              {mode === "edit" && (
                <Button onClick={analyzeAgain} disabled={busy}>
                  Re-analyze
                </Button>
              )}

              {mode && canPractice(user) && (
                <Button onClick={() => choose(practice ? "edit" : "practice")}>
                  {practice ? "Show the chords" : "Practice mode"}
                </Button>
              )}

              {inProgress && <AnalyzingIndicator />}
            </Stack>

            {mode == null ? (
              <ModeChoice onChoose={choose} />
            ) : (
              <ChartSheet
                recordingId={recordingId}
                // The server deleted the upload when analysis finished; play the local copy.
                audioSrc={audioUrl}
                analysis={analysis}
                duration={duration}
                inProgress={inProgress}
                practice={practice}
              />
            )}
          </div>
        </PlaybackProvider>
      )}

      <p className="muted guest-cta">
        <Link to="/register">Create an account</Link> to save your chord sheets and work on
        several songs at once — this one disappears when you leave.
      </p>
    </div>
  );
}
