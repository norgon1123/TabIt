import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadRecording } from "../library/uploadRecording";

/** The logged-out visitor's one song.
 *
 * Two things are deliberately kept in the browser rather than on the server:
 *
 * - **The audio.** The server deletes the uploaded file as soon as analysis finishes, so
 *   playback in the chord sheet comes from an object URL over the very File the user picked.
 *   Nothing is streamed back from us because there is nothing left to stream.
 * - **The file itself**, so "analyze again" can simply re-send it — a guest recording has no
 *   audio on the server to re-read, and re-uploading replaces their slot anyway.
 */
export function useGuestSong() {
  const queryClient = useQueryClient();
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const urlRef = useRef<string | null>(null);

  const revoke = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  useEffect(() => revoke, [revoke]); // don't leak the object URL when the page goes away

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadRecording(file),
    onSuccess: (rec, file) => {
      fileRef.current = file;
      revoke();
      urlRef.current = URL.createObjectURL(file);
      setAudioUrl(urlRef.current);
      // The previous song's cached chart/recording belong to a slot the server just replaced.
      queryClient.removeQueries({ queryKey: ["chart"] });
      queryClient.removeQueries({ queryKey: ["recording"] });
      setRecordingId(rec.id);
    },
  });

  const analyzeAgain = useCallback(() => {
    const file = fileRef.current;
    if (file) uploadMut.mutate(file);
  }, [uploadMut]);

  return {
    recordingId,
    audioUrl,
    filename: fileRef.current?.name ?? null,
    upload: (file: File) => uploadMut.mutate(file),
    analyzeAgain,
    isUploading: uploadMut.isPending,
    uploadError: uploadMut.error?.message ?? null,
  };
}
