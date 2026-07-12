import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "../api/client";
import type { ChartOut, SegmentOut, SegmentWindowInput } from "../api/types";

export interface SegmentInput {
  start_beat: number;
  end_beat: number;
  chord_root: string;
  chord_quality: string;
}
export type SegmentPatch = Partial<SegmentInput>;
export interface ChartSettingsPatch {
  beats_per_measure?: number;
  measure_offset?: number;
}

async function fetchChart(recordingId: string): Promise<ChartOut | null> {
  try {
    return await api.get<ChartOut>(`/api/recordings/${recordingId}/chart`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export function useChart(
  recordingId: string,
  options: { poll?: boolean; awaitChart?: boolean } = {},
) {
  const queryClient = useQueryClient();
  const key = ["chart", recordingId];

  const chartQuery = useQuery({
    queryKey: key,
    queryFn: () => fetchChart(recordingId),
    // `poll` goes false as soon as the recording query sees "done", which on its own would
    // cancel this query's next tick before it ever fetched the chart the job had just
    // written — leaving the page with no chart and no audio player. `awaitChart` keeps the
    // poll alive across that hand-off until the chart actually lands (analysis only reports
    // "done" once the chart is committed, so this terminates).
    refetchInterval: (query) =>
      options.poll || (options.awaitChart && query.state.data == null) ? 2000 : false,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });
  const chartId = chartQuery.data?.id;

  const addMut = useMutation({
    mutationFn: (input: SegmentInput) =>
      api.postJson<SegmentOut>(`/api/charts/${chartId}/segments`, input),
    onSuccess: invalidate,
  });
  const updateMut = useMutation({
    mutationFn: ({ segmentId, patch }: { segmentId: string; patch: SegmentPatch }) =>
      api.patchJson<SegmentOut>(`/api/charts/${chartId}/segments/${segmentId}`, patch),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (segmentId: string) => api.del(`/api/charts/${chartId}/segments/${segmentId}`),
    onSuccess: invalidate,
  });
  const transposeMut = useMutation({
    mutationFn: (semitones: number) =>
      api.postJson<ChartOut>(`/api/charts/${chartId}/transpose`, { semitones }),
    onSuccess: invalidate,
  });
  const settingsMut = useMutation({
    mutationFn: (patch: ChartSettingsPatch) =>
      api.patchJson<ChartOut>(`/api/charts/${chartId}/settings`, patch),
    onSuccess: invalidate,
  });
  const resizeMut = useMutation({
    mutationFn: (windows: SegmentWindowInput[]) =>
      api.patchJson<ChartOut>(`/api/charts/${chartId}/segments`, { segments: windows }),
    onMutate: async (windows: SegmentWindowInput[]) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<ChartOut | null>(key);
      if (prev) {
        const byId = new Map(windows.map((w) => [w.id, w]));
        queryClient.setQueryData<ChartOut>(key, {
          ...prev,
          segments: prev.segments.map((s) => {
            const w = byId.get(s.id);
            return w ? { ...s, start_beat: w.start_beat, end_beat: w.end_beat } : s;
          }),
        });
      }
      return { prev };
    },
    onError: (_e, _w, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(key, ctx.prev);
    },
    onSettled: invalidate,
  });

  return {
    chart: chartQuery.data ?? null,
    isLoading: chartQuery.isLoading,
    isMutating:
      addMut.isPending ||
      updateMut.isPending ||
      deleteMut.isPending ||
      transposeMut.isPending ||
      settingsMut.isPending ||
      resizeMut.isPending,
    addSegment: (input: SegmentInput) => addMut.mutateAsync(input),
    updateSegment: (segmentId: string, patch: SegmentPatch) =>
      updateMut.mutateAsync({ segmentId, patch }),
    deleteSegment: (segmentId: string) => deleteMut.mutateAsync(segmentId),
    transpose: (semitones: number) => transposeMut.mutateAsync(semitones),
    updateSettings: (patch: ChartSettingsPatch) => settingsMut.mutateAsync(patch),
    resizeSegments: (windows: SegmentWindowInput[]) => resizeMut.mutateAsync(windows),
  };
}
