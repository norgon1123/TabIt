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
    // Browsers reject play() when there has been no user gesture yet. That is not an error
    // anyone can act on — the element stays paused and `playing` stays false, which is
    // already the truth. What must NOT happen is an unhandled rejection, or a crash, from
    // a user simply pressing the play button.
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockRejectedValue(new DOMException("NotAllowedError"));

    render(
      <PlaybackProvider>
        <ControlDeck grid={GRID} />
        <AudioProbe />
      </PlaybackProvider>,
    );

    await expect(
      userEvent.click(screen.getByRole("button", { name: /^play$/i })),
    ).resolves.not.toThrow();

    expect(screen.getByRole("button", { name: /^play$/i })).toBeInTheDocument(); // still says Play
    play.mockRestore();
  });
});

/** The deck does not render the <audio> element — the sheet does. Stand one in. */
function AudioProbe() {
  const clock = usePlayback();
  return <audio ref={clock.ref} />;
}
