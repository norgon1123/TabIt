import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlaybackProvider, usePlayback } from "./PlaybackContext";

function Probe() {
  const clock = usePlayback();
  return (
    <>
      <span data-testid="playing">{String(clock.playing)}</span>
      <audio ref={clock.ref} data-testid="audio" />
    </>
  );
}

describe("PlaybackProvider", () => {
  it("hands the same clock to every consumer", () => {
    render(
      <PlaybackProvider>
        <Probe />
      </PlaybackProvider>,
    );
    expect(screen.getByTestId("playing")).toHaveTextContent("false");
  });

  it("exposes the ref, so the <audio> element can be attached by a child", () => {
    render(
      <PlaybackProvider>
        <Probe />
      </PlaybackProvider>,
    );
    expect(screen.getByTestId("audio")).toBeInTheDocument();
  });

  it("throws outside a provider rather than silently handing back a dead clock", () => {
    // A dead clock would look like "the song is paused, forever" — a bug that presents as
    // a UI that simply does not work, with nothing in the console. Fail loudly instead.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/usePlayback must be used inside a PlaybackProvider/);
    quiet.mockRestore();
  });
});
