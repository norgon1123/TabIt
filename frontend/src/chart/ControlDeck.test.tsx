import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import ControlDeck from "./ControlDeck";
import { PlaybackProvider, usePlayback } from "./PlaybackContext";
import type { BeatGridInfo } from "./musicalPosition";

const GRID: BeatGridInfo = {
  beatTimes: Array.from({ length: 33 }, (_, i) => i * 0.5),
  bpm: 120,
  duration: 16,
  beatsPerMeasure: 4,
  measureOffset: 0,
};

function renderDeck(extra?: React.ReactNode) {
  return render(
    <PlaybackProvider>
      <ControlDeck grid={GRID}>{extra}</ControlDeck>
    </PlaybackProvider>,
  );
}

describe("ControlDeck", () => {
  it("offers a real play button whose name says what pressing it DOES", () => {
    // "Playing" as a label is ambiguous read aloud — is it reporting a state or offering
    // an action? The name must say what happens when you press it.
    renderDeck();
    expect(screen.getByRole("button", { name: /^play$/i })).toBeInTheDocument();
  });

  it("carries the scrubber", () => {
    renderDeck();
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("puts whatever the sheet hands it into the deck", () => {
    // The deck does not know what a chart is. Tempo and key are passed in.
    renderDeck(<span>92 BPM</span>);
    expect(screen.getByText("92 BPM")).toBeInTheDocument();
  });

  it("is a landmark, so a screen-reader user can jump straight to the transport", () => {
    renderDeck();
    expect(screen.getByRole("region", { name: /playback/i })).toBeInTheDocument();
  });

  it("has no live region — the deck must stay silent while the song plays", () => {
    // The user is LISTENING. Anything that narrates during playback competes with the
    // music. This is the single rule the whole phase turns on.
    const { container } = renderDeck();
    expect(container.querySelector("[aria-live]")).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("toggles playback when the play button is pressed", async () => {
    // jsdom does not implement play(); spy on the prototype so the click has something
    // to hit.
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    render(
      <PlaybackProvider>
        <ControlDeck grid={GRID} />
        <AudioProbe />
      </PlaybackProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /^play$/i }));
    expect(play).toHaveBeenCalledOnce();
    play.mockRestore();
  });

  it("survives the browser refusing to play", async () => {
    // Browsers reject play() when there has been no user gesture yet (autoplay policy). That
    // is not an error anyone can act on: the element stays paused and `playing` stays false,
    // which is already the truth. What must NOT happen is an unhandled rejection escaping
    // from a user simply pressing the play button.
    //
    // toggle()/play() fire `el.play()` but do not (and must not) await it, so the click
    // handler — and the `userEvent.click` promise — resolve before the rejection has even
    // settled. An earlier version of this test asserted
    // `await expect(userEvent.click(...)).resolves.not.toThrow()`, which was green whether
    // or not the `.catch(() => {})` guard existed: that assertion settles before the
    // detached rejection does, so it structurally could not see the thing it was checking.
    //
    // This version listens for the unhandled rejection itself and gives it a turn of the
    // event loop to surface before asserting none fired. Crucially, it does NOT use
    // `vi.spyOn(...).mockRejectedValue(...)` to fake the rejection: vitest's mock wrapper
    // attaches its own internal `.then`/`.catch` to every mocked async call (to populate
    // `mock.results`), which permanently marks that promise "handled" to Node — Node then
    // never emits `unhandledRejection` for it, regardless of whether the guard under test
    // exists. (Verified directly: a bare `vi.fn(() => Promise.reject(...))`, called with no
    // `.catch` anywhere, never triggers `process.on("unhandledRejection", ...)`.) So the
    // rejecting `play()` here is a plain function, not a vitest mock, and the call is
    // tracked by hand instead of via `mock.calls`.
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    const originalPlay = HTMLMediaElement.prototype.play;
    let playCalls = 0;
    HTMLMediaElement.prototype.play = function rejectingPlay() {
      playCalls++;
      return Promise.reject(new DOMException("NotAllowedError"));
    };

    render(
      <PlaybackProvider>
        <ControlDeck grid={GRID} />
        <AudioProbe />
      </PlaybackProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /^play$/i }));

    // The rejection from the detached play() promise settles on a later turn of the event
    // loop than the click handler. Flush it so the rejection has a chance to surface before
    // we assert none did.
    await new Promise((resolve) => setImmediate(resolve));

    expect(playCalls).toBeGreaterThan(0); // sanity: play() was actually exercised
    expect(unhandled).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^play$/i })).toBeInTheDocument(); // still says Play

    process.off("unhandledRejection", unhandled);
    HTMLMediaElement.prototype.play = originalPlay;
  });
});

/** The deck does not render the <audio> element — the sheet does. Stand one in. */
function AudioProbe() {
  const clock = usePlayback();
  return <audio ref={clock.ref} />;
}
