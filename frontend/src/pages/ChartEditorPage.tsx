import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { RecordingOut } from "../api/types";
import { useChart } from "../chart/useChart";
import Timeline, { type SegmentUpdate } from "../chart/Timeline";
import SegmentEditor from "../chart/SegmentEditor";
import TransposeControl from "../chart/TransposeControl";
import TimeSignatureControl from "../chart/TimeSignatureControl";

export default function ChartEditorPage() {
  const { recordingId } = useParams<{ recordingId: string }>();
  const id = recordingId!;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const recordingQuery = useQuery({
    queryKey: ["recording", id],
    queryFn: () => api.get<RecordingOut>(`/api/recordings/${id}`),
  });
  const {
    chart,
    isLoading: chartLoading,
    isMutating,
    addSegment,
    updateSegment,
    deleteSegment,
    transpose,
    reorder,
    updateSettings,
  } = useChart(id);

  const recording = recordingQuery.data;
  const analysis = recording?.analysis ?? null;
  const duration = recording?.duration_seconds ?? 0;

  const seek = (time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const applyResize = async (updates: SegmentUpdate[]) => {
    for (const u of updates) await updateSegment(u.id, u.patch); // ordered: shrink before grow
  };

  const reorderSegments = (orderedIds: string[]) => reorder(orderedIds);

  if (recordingQuery.isLoading || chartLoading) return <p className="muted container">Loading…</p>;

  return (
    <div className="container">
      <p><Link to="/">← Library</Link></p>
      <h1>{recording?.original_filename ?? "Chart"}</h1>

      {analysis?.status === "failed" && (
        <p className="error">Analysis failed: {analysis.error}</p>
      )}

      {!chart && analysis?.status !== "failed" && (
        <p className="muted">Analyzing… the chart will appear when analysis finishes.</p>
      )}

      {chart && (
        <>
          <p className="muted">
            {analysis?.bpm != null && <>{Math.round(analysis.bpm)} BPM · </>}
            Key: {chart.key_tonic} {chart.key_mode}
          </p>

          <audio
            ref={audioRef}
            controls
            style={{ width: "100%" }}
            src={`/api/recordings/${id}/audio`}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          />

          <div style={{ marginTop: 12 }}>
            <Timeline
              segments={chart.segments}
              beatsPerMeasure={chart.beats_per_measure}
              measureOffset={chart.measure_offset}
              duration={duration}
              currentTime={currentTime}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSeek={seek}
              onResizeCommit={applyResize}
              onReorder={reorderSegments}
            />
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <TransposeControl
              keyLabel={`${chart.key_tonic} ${chart.key_mode}`}
              onTranspose={(semitones) => transpose(semitones)}
              busy={isMutating}
            />

            <TimeSignatureControl
              beatsPerMeasure={chart.beats_per_measure}
              measureOffset={chart.measure_offset}
              onChange={(patch) => updateSettings(patch)}
              busy={isMutating}
            />

            <button
              disabled={isMutating}
              onClick={() => {
                const lastEnd = chart.segments[chart.segments.length - 1]?.end_beat ?? 0;
                addSegment({
                  start_beat: lastEnd,
                  end_beat: lastEnd + chart.beats_per_measure,
                  chord_root: chart.key_tonic,
                  chord_quality: "maj",
                });
              }}
            >
              Add segment
            </button>

            {selectedId && chart.segments.find((s) => s.id === selectedId) && (
              <SegmentEditor
                segment={chart.segments.find((s) => s.id === selectedId)!}
                onSave={(patch) => updateSegment(selectedId, patch).then(() => undefined)}
                onDelete={() => {
                  deleteSegment(selectedId);
                  setSelectedId(null);
                }}
                busy={isMutating}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
