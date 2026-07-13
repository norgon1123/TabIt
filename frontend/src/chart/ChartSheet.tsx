import { useState } from "react";
import type { AnalysisOut } from "../api/types";
import { useChart } from "./useChart";
import { useMediaClock } from "./useMediaClock";
import { totalBeats } from "./beatGrid";
import Timeline, { type SegmentUpdate } from "./Timeline";
// import ScrubBar from "./ScrubBar"; // disabled with the scrub-bar block below
import SegmentEditor from "./SegmentEditor";
import TempoControl from "./TempoControl";
import KeyControl from "./KeyControl";
import TransposeControl from "./TransposeControl";
import TimeSignatureControl from "./TimeSignatureControl";

/** The chord sheet: player, timeline, and every control that edits the chart.
 *
 * Shared verbatim by the signed-in editor page and the logged-out home page — the only
 * difference between them is where the audio comes from (`audioSrc`: the API for a stored
 * recording, an object URL for a guest's, whose upload the server has already deleted).
 */
export default function ChartSheet({
  recordingId,
  audioSrc,
  analysis,
  duration,
  inProgress,
}: {
  recordingId: string;
  audioSrc: string;
  analysis: AnalysisOut | null;
  duration: number;
  inProgress: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clock = useMediaClock();

  const {
    chart,
    isLoading,
    isMutating,
    addSegment,
    updateSegment,
    deleteSegment,
    resizeSegments,
    transpose,
    updateSettings,
    setTempo,
  } = useChart(recordingId, { poll: inProgress, awaitChart: analysis?.status === "done" });

  const applyResize = async (updates: SegmentUpdate[]) => {
    for (const u of updates) await updateSegment(u.id, u.patch); // ordered: shrink before grow
  };

  if (analysis?.status === "failed") {
    return <p className="error">Analysis failed: {analysis.error}</p>;
  }
  if (!chart) {
    return (
      <p className="muted">
        {isLoading || inProgress
          ? "Analyzing… the chart will appear when analysis finishes."
          : "No chart yet."}
      </p>
    );
  }

  return (
    <>
      <p className="muted">
        {analysis?.bpm != null && <>{analysis.bpm} BPM &middot; </>}
        Key: {chart.key_tonic} {chart.key_mode}
      </p>

      <audio ref={clock.ref} controls style={{ width: "100%" }} src={audioSrc} />

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

        <TransposeControl onTranspose={(semitones) => transpose(semitones)} busy={isMutating} />

        <TempoControl
          bpm={chart.bpm ?? analysis?.bpm ?? null}
          onChange={(bpm) => setTempo(bpm)}
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
            maxTotalBeats={totalBeats(chart.beat_times, chart.bpm ?? analysis?.bpm ?? null, duration)}
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
  );
}
