import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editorTop, setEditorTop] = useState(0);
  const chartArea = useRef<HTMLDivElement | null>(null);
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

  // Line the editor up with the chord it edits: its top matches the top of the selected
  // cell, measured against the chart area it is positioned inside. The chart wraps to
  // however many lines fit, so the offset has to be read from the DOM — nothing about the
  // beat grid predicts which line a chord lands on at a given width. Re-measure on resize,
  // and whenever the chart changes (a re-count or a neighbour's resize can push the chord
  // onto a different line under a stationary pointer).
  useLayoutEffect(() => {
    if (!selectedId) return;
    const measure = () => {
      const area = chartArea.current;
      const cell = area?.querySelector<HTMLElement>(`[data-segment-id="${selectedId}"]`);
      if (!area || !cell) return;
      setEditorTop(cell.getBoundingClientRect().top - area.getBoundingClientRect().top);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [selectedId, chart]);

  // Clicking off the selected chord closes the editor. The editor is out of the page flow,
  // so "off" is anything outside both it and a chord cell — pressing another chord
  // re-selects instead (the cell swallows the dismissal here and Timeline's own click
  // handler picks the new one).
  useEffect(() => {
    if (!selectedId) return;
    const dismiss = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".segment-editor, [data-segment-id]")) return;
      setSelectedId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", onKey);
    };
  }, [selectedId]);

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

  const bpm = chart.bpm ?? analysis?.bpm ?? null;

  return (
    <>
      {/* Tempo and key read as a sentence about the song and are edited where they are
          read — click the BPM or the key to change it, no separate panel of form fields. */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
        <TempoControl bpm={bpm} onChange={(next) => setTempo(next)} busy={isMutating} />
        {bpm != null && <span className="muted">&middot;</span>}
        <span className="muted" style={{ marginLeft: 6 }}>Key:</span>
        <KeyControl
          keyTonic={chart.key_tonic}
          keyMode={chart.key_mode}
          onChange={(patch) => updateSettings(patch)}
          busy={isMutating}
        />
      </div>

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

      <div className="chart-area" ref={chartArea} style={{ marginTop: 12 }}>
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

        {selectedId && chart.segments.find((s) => s.id === selectedId) && (
          <SegmentEditor
            segment={chart.segments.find((s) => s.id === selectedId)!}
            allSegments={chart.segments}
            maxTotalBeats={totalBeats(chart.beat_times, bpm, duration)}
            top={editorTop}
            onResize={(windows) => resizeSegments(windows)}
            onSave={(patch) => updateSegment(selectedId, patch).then(() => undefined)}
            onDelete={() => {
              deleteSegment(selectedId);
              setSelectedId(null);
            }}
            onClose={() => setSelectedId(null)}
            busy={isMutating}
          />
        )}
      </div>

      {/* Tempo and key are edited in the line above the player, so Advanced options is what
          is left: the counts and shifts you reach for rarely. */}
      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        <button
          aria-expanded={showAdvanced}
          style={{ justifySelf: "start" }}
          onClick={() => setShowAdvanced((open) => !open)}
        >
          {showAdvanced ? "▾" : "▸"} Advanced options
        </button>

        {showAdvanced && (
          <div style={{ display: "grid", gap: 12 }}>
            <TimeSignatureControl
              beatsPerMeasure={chart.beats_per_measure}
              measureOffset={chart.measure_offset}
              onChange={(patch) => updateSettings(patch)}
              busy={isMutating}
            />

            <TransposeControl onTranspose={(semitones) => transpose(semitones)} busy={isMutating} />

            <button
              disabled={isMutating}
              style={{ justifySelf: "start" }}
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
          </div>
        )}
      </div>
    </>
  );
}
