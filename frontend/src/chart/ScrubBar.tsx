import { useEffect, useRef, useState } from "react";

interface ScrubBarProps {
  currentTime: number;
  duration: number;
  playing: boolean;
  rate: number;
  onSeek: (time: number) => void;
}

export default function ScrubBar({ currentTime, duration, playing, rate, onSeek }: ScrubBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const frac = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  // Arm a compositor CSS transition toward the end while playing; snap to the
  // true position while paused or dragging. Re-runs each timeupdate to re-sync.
  useEffect(() => {
    const fill = fillRef.current;
    const knob = knobRef.current;
    if (!fill || !knob) return;
    fill.style.transition = "none";
    knob.style.transition = "none";
    fill.style.transform = `scaleX(${frac})`;
    knob.style.left = `${frac * 100}%`;
    if (dragging || !playing || duration <= 0) return;
    const remaining = Math.max(0, (duration - currentTime) / (rate || 1));
    const raf = requestAnimationFrame(() => {
      fill.style.transition = `transform ${remaining}s linear`;
      knob.style.transition = `left ${remaining}s linear`;
      fill.style.transform = "scaleX(1)";
      knob.style.left = "100%";
    });
    return () => cancelAnimationFrame(raf);
  }, [frac, currentTime, duration, playing, rate, dragging]);

  function fracFromClientX(clientX: number): number {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function onPointerDown(e: React.PointerEvent) {
    if (duration <= 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* not supported (e.g. jsdom) */
    }
    setDragging(true);
    onSeek(fracFromClientX(e.clientX) * duration);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || duration <= 0) return;
    onSeek(fracFromClientX(e.clientX) * duration);
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!dragging) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* not supported (e.g. jsdom) */
    }
    setDragging(false);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (duration <= 0) return;
    if (e.key === "ArrowRight") onSeek(currentTime + 5);
    else if (e.key === "ArrowLeft") onSeek(currentTime - 5);
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={duration || 0}
      aria-valuenow={currentTime}
      tabIndex={0}
      className="scrub-bar"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      style={{ position: "relative", height: 14, cursor: "pointer", touchAction: "none" }}
    >
      <div
        aria-hidden
        style={{ position: "absolute", left: 0, right: 0, top: 6, height: 4, background: "#2c313a", borderRadius: 2 }}
      />
      <div
        ref={fillRef}
        aria-hidden
        className="scrub-fill"
        style={{
          position: "absolute",
          left: 0,
          top: 6,
          height: 4,
          width: "100%",
          transformOrigin: "left",
          transform: `scaleX(${frac})`,
          background: "var(--accent)",
          borderRadius: 2,
        }}
      />
      <div
        ref={knobRef}
        aria-hidden
        className="scrub-knob"
        style={{
          position: "absolute",
          top: 2,
          left: `${frac * 100}%`,
          width: 10,
          height: 10,
          marginLeft: -5,
          borderRadius: "50%",
          background: "var(--accent)",
        }}
      />
    </div>
  );
}
