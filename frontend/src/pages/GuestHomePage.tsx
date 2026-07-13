import { Link } from "react-router-dom";
import ChartSheet from "../chart/ChartSheet";
import { useRecording } from "../chart/useRecording";
import { useGuestSong } from "../guest/useGuestSong";
import UploadDropzone from "../library/UploadDropzone";
import Spinner from "../components/Spinner";

/** Tabit without an account: upload a song, and its chord sheet appears right below.
 *
 * One song at a time, held in memory on the server and gone from disk the moment analysis
 * ends — uploading another simply replaces it. The chart itself is the same component a
 * signed-in user edits.
 */
export default function GuestHomePage() {
  const { recordingId, audioUrl, filename, upload, analyzeAgain, isUploading, uploadError } =
    useGuestSong();
  const { analysis, duration, inProgress } = useRecording(recordingId);
  const busy = isUploading || inProgress;

  return (
    <div className="container">
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
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>{filename ?? "Chart"}</h2>
            <button onClick={analyzeAgain} disabled={busy}>
              Re-analyze
            </button>
            {inProgress && (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }} className="muted">
                <Spinner label="Analyzing" /> Analyzing&hellip;
              </span>
            )}
          </div>

          <ChartSheet
            recordingId={recordingId}
            // The server deleted the upload when analysis finished; play the local copy.
            audioSrc={audioUrl}
            analysis={analysis}
            duration={duration}
            inProgress={inProgress}
          />
        </div>
      )}

      <p className="muted" style={{ marginTop: 32 }}>
        <Link to="/register">Create an account</Link> to save your chord sheets and work on
        several songs at once — this one disappears when you leave.
      </p>
    </div>
  );
}
