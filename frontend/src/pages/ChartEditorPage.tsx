import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { RecordingOut } from "../api/types";
import { useChart } from "../chart/useChart";
import { useMediaClock } from "../chart/useMediaClock";
import { totalBeats } from "../chart/beatGrid";
import Timeline, { type SegmentUpdate } from "../chart/Timeline";
// import ScrubBar from "../chart/ScrubBar"; // disabled with the scrub-bar block below
import SegmentEditor from "../chart/SegmentEditor";
import KeyControl from "../chart/KeyControl";
import TransposeControl from "../chart/TransposeControl";
import TimeSignatureControl from "../chart/TimeSignatureControl";
import { useReanalyze } from "../chart/useReanalyze";
import Spinner from "../components/Spinner";

export default function ChartEditorPage() {
  const { recordingId } = useParams<{ recordingId: string }>();
  const id = recordingId!;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clock = useMediaClock();

  const recordingQuery = useQuery({
    queryKey: ["recording", id],
    queryFn: () => api.get<RecordingOut>(`/api/recordings/${id}`),
    refetchInterval: (query) => {
      const s = query.state.data?.analysis?.status;
      return s === "pending" || s === "running" ? 2000 : false;
    },
  });

  const recording = recordingQuery.data;
  const analysis = recording?.analysis ?? null;
  const duration = recording?.duration_seconds ?? 0;
  const inProgress = analysis?.status === "pending" || analysis?.status === "running";

  const {
    chart,
    isLoading: chartLoading,
    isMutating,
    addSegment,
    updateSegment,
    deleteSegment,
    resizeSegments,
    transpose,
    updateSettings,
  } = useChart(id, { poll: inProgress });

  const { reanalyze, isPending: reanalyzing } = useReanalyze(id);

  const applyResize = async (updates: SegmentUpdate[]) => {
    for (const u of updates) await updateSegment(u.id, u.patch); // ordered: shrink before grow
  };

  if (recordingQuery.isLoading || chartLoading) return <p className="muted container">Loading...</p>;

  return (
    <div className="container">
      <p><Link to="/">&larr; Library</Link></p>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>{recording?.original_filename ?? "Chart"}</h1>
        <button onClick={() => reanalyze()} disabled={reanalyzing || inProgress}>
          Re-analyze
        </button>
        {inProgress && (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }} className="muted">
            <Spinner label="Analyzing" /> Analyzing&hellip;
          </span>
        )}
      </div>

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
              beatsPerMeasure={chart.beats_per_measure}
              measureOffset={chart.measure_offset}
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
            <KeyControl
              keyTonic={chart.key_tonic}
              keyMode={chart.key_mode}
              onChange={(patch) => updateSettings(patch)}
              busy={isMutating}
            />

            <TransposeControl
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
                allSegments={chart.segments}
                maxTotalBeats={totalBeats(chart.beat_times, analysis?.bpm ?? null, duration)}
                onResize={(windows) => resizeSegments(windows)}
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
