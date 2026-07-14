import { useEffect, useState } from "react";
import type { AnalysisOut } from "../api/types";
import { useChart } from "./useChart";
import { usePlayback } from "./PlaybackContext";
import { totalBeats } from "./beatGrid";
import Timeline, { type SegmentUpdate } from "./Timeline";
import type { BeatGridInfo } from "./musicalPosition";
import ControlDeck from "./ControlDeck";
import WhereAmI from "./WhereAmI";
import SegmentEditor from "./SegmentEditor";
import TempoControl from "./TempoControl";
import KeyControl from "./KeyControl";
import TransposeControl from "./TransposeControl";
import TimeSignatureControl from "./TimeSignatureControl";
import ChordGuess from "../practice/ChordGuess";
import { usePracticeSession } from "../practice/usePracticeSession";
import Stack from "../ui/Stack";
import Button from "../ui/Button";

const NO_SEGMENTS: never[] = [];

/** The chord sheet: player, timeline, and every control that edits the chart.
 *
 * Shared verbatim by the signed-in editor page and the logged-out home page — the only
 * difference between them is where the audio comes from (`audioSrc`: the API for a stored
 * recording, an object URL for a guest's, whose upload the server has already deleted).
 *
 * In `practice` mode it is the same sheet with the answers taken away: the chords are "?"
 * until the player names them, and every control that would edit the chart is gone — you
 * cannot practise against a chart you are simultaneously rewriting.
 */
export default function ChartSheet({
  recordingId,
  audioSrc,
  analysis,
  duration,
  inProgress,
  practice = false,
}: {
  recordingId: string;
  audioSrc: string;
  analysis: AnalysisOut | null;
  duration: number;
  inProgress: boolean;
  practice?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const clock = usePlayback();

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

  // Hooks run before the early returns below, so the session is built from the segments the
  // chart has (none, while it is still analysing) rather than from a chart that may be null.
  const session = usePracticeSession(chart?.segments ?? NO_SEGMENTS);

  const applyResize = async (updates: SegmentUpdate[]) => {
    for (const u of updates) await updateSegment(u.id, u.patch); // ordered: shrink before grow
  };

  // Clicking off the selected chord closes the editor. The editor is out of the page flow,
  // so "off" is anything outside both it and a chord cell — pressing another chord
  // re-selects instead (the cell swallows the dismissal here and Timeline's own click
  // handler picks the new one).
  useEffect(() => {
    if (!selectedId) return;
    const dismiss = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".chart-panel, [data-segment-id]")) return;
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
  const selected = selectedId ? chart.segments.find((s) => s.id === selectedId) : undefined;
  // Threaded through Timeline (position announcements), ControlDeck (the scrubber's
  // aria-valuetext) and WhereAmI (the on-demand "where am I") — built once, here.
  const grid: BeatGridInfo = {
    // ChartOut declares beat_times as always-present, but it is fine either way: barBeatAt's
    // beatIndexAt spreads it into an array, and a genuinely missing value would throw before
    // it could ever fall back to the pure BPM division it already has for a short grid.
    beatTimes: chart.beat_times ?? [],
    bpm,
    duration,
    beatsPerMeasure: chart.beats_per_measure,
    measureOffset: chart.measure_offset,
  };

  // Tempo and key read as a sentence about the song and are edited where they are read —
  // click the BPM or the key to change it, no separate panel of form fields. Practice mode
  // reads them out but does not hand over the pen: tempo and key are what a player is given
  // on any chart, and re-cutting either mid-quiz is editing. Handed to the deck as its
  // children — the deck does not know what a chart is.
  const tempoAndKey = practice ? (
    <p className="muted chart-key-summary">
      {bpm != null && <>{bpm} BPM &middot; </>}
      Key: {chart.key_tonic} {chart.key_mode}
    </p>
  ) : (
    <Stack wrap gap={2}>
      <TempoControl bpm={bpm} onChange={(next) => setTempo(next)} busy={isMutating} />
      {bpm != null && <span className="muted">&middot;</span>}
      <span className="muted">Key:</span>
      <KeyControl
        keyTonic={chart.key_tonic}
        keyMode={chart.key_mode}
        onChange={(patch) => updateSettings(patch)}
        busy={isMutating}
      />
    </Stack>
  );

  return (
    <>
      {/* The deck is the controls now — no native `controls` attribute, so it does not
          duplicate the transport. Kept in the DOM (just visually hidden) since it is still
          what actually plays the audio; the ref wires it to the shared clock. */}
      <audio ref={clock.ref} className="chart-audio visually-hidden" src={audioSrc} />

      {practice && (
        <p
          className="muted chart-practice-status"
          // role="status" ONLY while paused. During playback the user is listening, and this
          // would announce "3 of 8 chords named" over the top of the song. The text stays on
          // screen either way — it just stops SPEAKING.
          role={clock.playing ? undefined : "status"}
        >
          {session.total === 0
            ? "No chords in this chart — nothing to name."
            : session.solvedCount === session.total
              ? `All ${session.total} chords named — the chart is yours.`
              : `${session.solvedCount} of ${session.total} chords named. Click a “?” to name it.`}
        </p>
      )}

      <div className="chart-workspace" data-panel-open={selected ? "true" : undefined}>
        <Timeline
          segments={chart.segments}
          beatsPerMeasure={chart.beats_per_measure}
          measureOffset={chart.measure_offset}
          duration={duration}
          currentTime={clock.currentTime}
          playing={clock.playing}
          rate={clock.rate}
          selectedId={selectedId}
          maskedIds={practice ? session.masked : undefined}
          grid={grid}
          onSelect={setSelectedId}
          onSeek={clock.seek}
          // Practice is read-only: no resize handles, so the chart cannot move under a
          // player who is trying to hear where a chord ends.
          onResizeCommit={practice ? undefined : applyResize}
        />

        {selected && practice && (
          <ChordGuess
            key={selected.id}
            segment={selected}
            solved={session.isSolved(selected.id)}
            // Reveal on the chart as soon as it is named — the form owns its own goodbye, and
            // stays mounted (green) through the flash rather than being unmounted by the
            // reveal it just caused.
            onSolved={session.reveal}
            onClose={() => setSelectedId(null)}
          />
        )}

        {selected && !practice && (
          <SegmentEditor
            segment={selected}
            allSegments={chart.segments}
            maxTotalBeats={totalBeats(chart.beat_times, bpm, duration)}
            onResize={(windows) => resizeSegments(windows)}
            onSave={(patch) => updateSegment(selected.id, patch).then(() => undefined)}
            onDelete={() => {
              deleteSegment(selected.id);
              setSelectedId(null);
            }}
            onClose={() => setSelectedId(null)}
            busy={isMutating}
          />
        )}
      </div>

      {/* Tempo and key are edited in the line above the player, so Advanced options is what
          is left: the counts and shifts you reach for rarely. Practice mode has none of it —
          transposing or re-cutting the chart mid-quiz would be rewriting the question. */}
      {!practice && (
        <Stack direction="column" gap={3} align="stretch" className="chart-advanced">
          <Button
            aria-expanded={showAdvanced}
            className="self-start"
            onClick={() => setShowAdvanced((open) => !open)}
          >
            {showAdvanced ? "▾" : "▸"} Advanced options
          </Button>

          {showAdvanced && (
            <Stack direction="column" gap={3} align="stretch">
              <TimeSignatureControl
                beatsPerMeasure={chart.beats_per_measure}
                measureOffset={chart.measure_offset}
                onChange={(patch) => updateSettings(patch)}
                busy={isMutating}
              />

              <TransposeControl onTranspose={(semitones) => transpose(semitones)} busy={isMutating} />

              <Button
                disabled={isMutating}
                className="self-start"
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
              </Button>
            </Stack>
          )}
        </Stack>
      )}

      {/* Zone 3, pinned to the bottom: the transport, the tempo/key sentence, and the
          on-demand "where am I" — everything you reach for while a song runs. */}
      <ControlDeck grid={grid}>
        {tempoAndKey}
        <WhereAmI grid={grid} />
      </ControlDeck>
    </>
  );
}
