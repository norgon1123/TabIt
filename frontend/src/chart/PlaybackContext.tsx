import { createContext, useContext, type ReactNode } from "react";
import { useMediaClock, type MediaClock } from "./useMediaClock";

/** The one place playback state lives.
 *
 *  Two sibling zones need it and neither owns the other: the control deck DRIVES playback,
 *  and the context bar RECEDES from it (chrome you are not using, while your eyes are on
 *  your hands, is chrome in the way). Threading a clock through both would mean lifting it
 *  into every page that renders a chart. A context is the honest shape. */
const PlaybackContext = createContext<MediaClock | null>(null);

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const clock = useMediaClock();
  return <PlaybackContext.Provider value={clock}>{children}</PlaybackContext.Provider>;
}

export function usePlayback(): MediaClock {
  const clock = useContext(PlaybackContext);
  if (!clock) throw new Error("usePlayback must be used inside a PlaybackProvider");
  return clock;
}
