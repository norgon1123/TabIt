import { useCallback, useRef, useState } from "react";

export interface MediaClock {
  currentTime: number;
  duration: number;
  playing: boolean;
  rate: number;
  seek: (time: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** Callback ref to attach to the <audio> element. */
  ref: (el: HTMLAudioElement | null) => void;
}

// Single source of playback truth. Reads state from media events (no rAF); the
// smooth motion lives in the consumers' CSS transitions.
export function useMediaClock(): MediaClock {
  const elRef = useRef<HTMLAudioElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);

  const ref = useCallback((el: HTMLAudioElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    elRef.current = el;
    if (!el) return;

    const onTime = () => setCurrentTime(el.currentTime);
    const onDuration = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onRate = () => setRate(el.playbackRate || 1);

    const pairs: Array<[string, () => void]> = [
      ["timeupdate", onTime],
      ["seeked", onTime],
      ["loadedmetadata", onDuration],
      ["durationchange", onDuration],
      ["play", onPlay],
      ["playing", onPlay],
      ["pause", onPause],
      ["ended", onPause],
      ["ratechange", onRate],
    ];
    for (const [name, fn] of pairs) el.addEventListener(name, fn);
    // Initialize from current element state (covers already-loaded media).
    onDuration();
    onRate();
    onTime();

    cleanupRef.current = () => {
      for (const [name, fn] of pairs) el.removeEventListener(name, fn);
    };
  }, []);

  const seek = useCallback(
    (time: number) => {
      const el = elRef.current;
      const max = duration > 0 ? duration : Number.POSITIVE_INFINITY;
      const clamped = Math.max(0, Math.min(max, time));
      if (el) el.currentTime = clamped;
      setCurrentTime(clamped);
    },
    [duration],
  );

  // The deck can paint before the <audio> mounts, so every one of these is a no-op
  // against a null ref rather than a throw. A play button that explodes on first
  // paint is worse than one that does nothing for a frame.
  const play = useCallback(() => {
    // A rejected play() (autoplay policy, no user gesture) is not an error we can act
    // on — the element stays paused and `playing` stays false, which is already the
    // truth.
    void elRef.current?.play()?.catch(() => {});
  }, []);

  const pause = useCallback(() => {
    elRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    if (el.paused) void el.play()?.catch(() => {});
    else el.pause();
  }, []);

  return { currentTime, duration, playing, rate, seek, play, pause, toggle, ref };
}
