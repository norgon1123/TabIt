import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AnalyzingIndicator from "./AnalyzingIndicator";
import { PlaybackProvider, usePlayback } from "./PlaybackContext";

/** Stands in for whatever page mounts this inside the PlaybackProvider: it attaches the
 *  clock's ref to a real <audio> element so play/pause events actually flip `playing`. */
function Harness() {
  const clock = usePlayback();
  return (
    <>
      <audio ref={clock.ref} data-testid="audio" />
      <AnalyzingIndicator />
    </>
  );
}

describe("AnalyzingIndicator", () => {
  it("announces while paused — role=status", () => {
    render(
      <PlaybackProvider>
        <Harness />
      </PlaybackProvider>,
    );
    expect(screen.getByRole("status", { name: /analyzing/i })).toBeInTheDocument();
  });

  it("stops announcing while a song plays, but stays visible", () => {
    // The bug this guards: re-analyzing does not unmount the chart (useReanalyze only
    // invalidates the recording query), so the audio can still be running when the
    // "Analyzing…" indicator reappears. It must not narrate over the music.
    render(
      <PlaybackProvider>
        <Harness />
      </PlaybackProvider>,
    );
    fireEvent.play(screen.getByTestId("audio"));

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(/Analyzing/)).toBeInTheDocument();
  });
});
