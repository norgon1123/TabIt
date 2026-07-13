import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AnalysisOut, RecordingOut } from "../api/types";

/** The recording behind a chord sheet, polled while its analysis is still running. */
export function useRecording(recordingId: string | null) {
  const query = useQuery({
    queryKey: ["recording", recordingId],
    queryFn: () => api.get<RecordingOut>(`/api/recordings/${recordingId}`),
    enabled: recordingId != null,
    refetchInterval: (q) => {
      const s = q.state.data?.analysis?.status;
      return s === "pending" || s === "running" ? 2000 : false;
    },
  });

  const recording = query.data ?? null;
  const analysis: AnalysisOut | null = recording?.analysis ?? null;
  return {
    recording,
    analysis,
    duration: recording?.duration_seconds ?? 0,
    inProgress: analysis?.status === "pending" || analysis?.status === "running",
    isLoading: recordingId != null && query.isLoading,
  };
}
