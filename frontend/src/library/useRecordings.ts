import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { RecordingOut } from "../api/types";
import { uploadRecording } from "./uploadRecording";

const KEY = ["recordings"];

function anyInProgress(list: RecordingOut[] | undefined): boolean {
  return !!list?.some((r) => r.analysis?.status === "pending" || r.analysis?.status === "running");
}

export function useRecordings() {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<RecordingOut[]>("/api/recordings"),
    refetchInterval: (query) => (anyInProgress(query.state.data) ? 2000 : false),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: KEY });

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadRecording(file),
    onSuccess: invalidate,
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => api.del(`/api/recordings/${id}`),
    onSuccess: invalidate,
  });

  const reanalyzeMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/recordings/${id}/analyze`),
    onSuccess: invalidate,
  });

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patchJson<RecordingOut>(`/api/recordings/${id}`, { original_filename: name }),
    onSuccess: invalidate,
  });

  return {
    recordings: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    upload: (file: File) => uploadMut.mutateAsync(file),
    remove: (id: string) => removeMut.mutateAsync(id),
    reanalyze: (id: string) => reanalyzeMut.mutateAsync(id),
    rename: (id: string, name: string) => renameMut.mutateAsync({ id, name }),
    isUploading: uploadMut.isPending,
    uploadError: uploadMut.error?.message ?? null,
  };
}
