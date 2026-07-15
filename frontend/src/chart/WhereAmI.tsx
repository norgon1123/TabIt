import { useState } from "react";
import Button from "../ui/Button";
import { usePlayback } from "./PlaybackContext";
import { barBeatAt, formatMusicalPosition, type BeatGridInfo } from "./musicalPosition";

/** The on-demand "where am I".
 *
 *  This exists precisely BECAUSE we are not allowed a live region on the chart. During
 *  playback the user is listening; a chart that announced every chord change as it played
 *  would talk over the song they are trying to learn — the assistive equivalent of someone
 *  shouting the chords at you while you practise.
 *
 *  So the app never volunteers its position. It answers when asked. */
export default function WhereAmI({ grid }: { grid: BeatGridInfo }) {
  const clock = usePlayback();
  const [said, setSaid] = useState("");

  return (
    <>
      <Button
        onClick={() => setSaid(formatMusicalPosition(barBeatAt(grid, clock.currentTime)))}
      >
        Where am I?
      </Button>
      {/* Polite, never assertive: the user asked a question, they can wait a beat for the
          answer. Assertive would cut across whatever the reader was already saying. */}
      <span role="status" aria-live="polite" className="visually-hidden">
        {said}
      </span>
    </>
  );
}
