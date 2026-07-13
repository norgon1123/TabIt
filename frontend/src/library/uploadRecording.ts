import { api } from "../api/client";
import type { RecordingOut } from "../api/types";
import { readAudioDuration } from "./audioDuration";
import { MAX_RECORDING_SECONDS, tooLongMessage } from "./uploadLimits";

/** POST a song for analysis.
 *
 * The one upload path: the server reads the session cookie and decides whether this becomes
 * a stored recording or a guest's in-memory one. The client sends the same request either
 * way, which is what keeps the two experiences identical.
 */
export async function uploadRecording(file: File): Promise<RecordingOut> {
  const duration = await readAudioDuration(file);
  if (duration != null && duration > MAX_RECORDING_SECONDS) throw new Error(tooLongMessage(duration));
  const form = new FormData();
  form.append("file", file);
  if (duration != null) form.append("duration_seconds", String(duration));
  return api.postForm<RecordingOut>("/api/recordings", form);
}
