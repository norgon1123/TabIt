import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useReanalyze(recordingId: string) {
  const queryClient = useQueryClient();
  const mut = useMutation({
    mutationFn: () => api.post(`/api/recordings/${recordingId}/analyze`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recording", recordingId] }),
  });
  return { reanalyze: () => mut.mutateAsync(), isPending: mut.isPending };
}
