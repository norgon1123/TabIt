import Spinner from "../components/Spinner";
import Stack from "../ui/Stack";
import { usePlayback } from "./PlaybackContext";

/** "Analyzing…", which must not say so out loud while a song is playing.
 *
 *  During playback the user is listening, and a live region competes with the music for the
 *  same channel. This is reachable through the ordinary flow: re-analysing does not unmount
 *  the chart (useReanalyze invalidates the recording query, not the chart query), so the
 *  audio can still be running when the spinner appears.
 *
 *  It stays on SCREEN either way. It just stops speaking. */
export default function AnalyzingIndicator() {
  const { playing } = usePlayback();
  return (
    <Stack gap={1} className="muted">
      <Spinner label="Analyzing" announce={!playing} /> Analyzing&hellip;
    </Stack>
  );
}
