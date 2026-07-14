import type { ReactNode } from "react";
import { usePlayback } from "./PlaybackContext";
import ScrubBar from "./ScrubBar";
import Stack from "../ui/Stack";
import Button from "../ui/Button";
import { formatTime } from "./timeMath";
import type { BeatGridInfo } from "./musicalPosition";

/** Zone 3: the transport, in one place, always the same place.
 *
 *  Everything you reach for while a song is running lives here — play, the scrubber, the
 *  clock, and (handed in by the sheet) the tempo and key. Before this, they were scattered
 *  between the native <audio> element and the page title row.
 *
 *  It is pinned to the BOTTOM, and that is not an aesthetic call: a phone app is on the
 *  roadmap, the bottom edge is the thumb zone, and putting the transport there today costs
 *  nothing and saves the move later.
 *
 *  It is SILENT. No live regions, no role="status". During playback the user is listening,
 *  and speech competes with the music. The deck speaks only when spoken to — the scrubber's
 *  aria-valuetext, read when you move it. */
export default function ControlDeck({
  grid,
  children,
}: {
  grid: BeatGridInfo;
  children?: ReactNode;
}) {
  const clock = usePlayback();
  const duration = clock.duration || grid.duration;

  return (
    <section className="control-deck" aria-label="Playback">
      <Stack className="control-deck__row" gap={3} align="center">
        <Button
          variant="primary"
          className="control-deck__play"
          onClick={clock.toggle}
          // The name says what pressing it DOES. "Playing" would be ambiguous read aloud:
          // a screen-reader user cannot tell a state report from an offer of an action.
          aria-label={clock.playing ? "Pause" : "Play"}
        >
          <span aria-hidden="true">{clock.playing ? "❚❚" : "▶"}</span>
        </Button>

        <span className="control-deck__time muted">{formatTime(clock.currentTime)}</span>

        <div className="control-deck__scrub">
          <ScrubBar
            currentTime={clock.currentTime}
            duration={duration}
            playing={clock.playing}
            rate={clock.rate}
            grid={grid}
            onSeek={clock.seek}
          />
        </div>

        <span className="control-deck__time muted">{formatTime(duration)}</span>

        {children && <div className="control-deck__extra">{children}</div>}
      </Stack>
    </section>
  );
}
