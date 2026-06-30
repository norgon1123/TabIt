import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { RecordingOut } from "../api/types";
import { useChart } from "../chart/useChart";
import { useMediaClock } from "../chart/useMediaClock";
import Timeline, { type SegmentUpdate } from "../chart/Timeline";
// import ScrubBar from "../chart/ScrubBar"; // disabled with the scrub-bar block below
import SegmentEditor from "../chart/SegmentEditor";
import TransposeControl from "../chart/TransposeControl";

export default function ChartEditorPage() {
  const { recordingId } = useParams<{ recordingId: string }>();
  const id = recordingId!;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clock = useMediaClock();

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
  } = useChart(id);

  const recording = recordingQuery.data;
  const analysis = recording?.analysis ?? null;
  const duration = recording?.duration_seconds ?? 0;

  const applyResize = async (updates: SegmentUpdate[]) => {
    for (const u of updates) await updateSegment(u.id, u.patch); // ordered: shrink before grow
  };

  if (recordingQuery.isLoading || chartLoading) return <p className="muted container">Loading...</p>;

  return (
    <div className="container">
      <p><Link to="/">&larr; Library</Link></p>
      <h1>{recording?.original_filename ?? "Chart"}</h1>

      {analysis?.status === "failed" && (
        <p className="error">Analysis failed: {analysis.error}</p>
      )}

      {!chart && analysis?.status !== "failed" && (
        <p className="muted">Analyzing&hellip; the chart will appear when analysis finishes.</p>
      )}

      {chart && (
        <>
          <p className="muted">
            {analysis?.bpm != null && <>{Math.round(analysis.bpm)} BPM &middot; </>}
            Key: {chart.key_tonic} {chart.key_mode}
          </p>

          <audio
            ref={clock.ref}
            controls
            style={{ width: "100%" }}
            src={`/api/recordings/${id}/audio`}
          />

          {/*
            YouTube-style scrub bar — commented out to avoid a duplicate bar
            alongside the native <audio> controls (bad UX). Kept for later use;
            re-enable by uncommenting this block.
          */}
          {/* <div style={{ marginTop: 8 }}>
            <ScrubBar
              currentTime={clock.currentTime}
              duration={clock.duration || duration}
              playing={clock.playing}
              rate={clock.rate}
              onSeek={clock.seek}
            />
          </div> */}

          <div style={{ marginTop: 12 }}>
            <Timeline
              segments={chart.segments}
              bpm={analysis?.bpm ?? null}
              duration={duration}
              currentTime={clock.currentTime}
              playing={clock.playing}
              rate={clock.rate}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSeek={clock.seek}
              onResizeCommit={applyResize}
            />
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <TransposeControl
              keyLabel={`${chart.key_tonic} ${chart.key_mode}`}
              onTranspose={(semitones) => transpose(semitones)}
              busy={isMutating}
            />

            <button
              disabled={isMutating}
              onClick={() => {
                const lastEnd = chart.segments[chart.segments.length - 1]?.end_time ?? 0;
                addSegment({
                  start_time: lastEnd,
                  end_time: Math.min(duration || lastEnd + 1, lastEnd + 1),
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
