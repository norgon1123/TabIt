import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ChartContextBar from "./ChartContextBar";
import { PlaybackProvider, usePlayback } from "./PlaybackContext";

function Harness({ playing }: { playing: boolean }) {
  return (
    <PlaybackProvider>
      <ChartContextBar title="Song.m4a" actions={<button>Practice mode</button>} />
      {playing && <ForcePlaying />}
    </PlaybackProvider>
  );
}

/** Drive `playing` by dispatching the real media event the clock listens for.
 *
 *  `clock.ref` is a CALLBACK ref (`(el) => void`), not a ref object — it has to be
 *  invoked with the node so it attaches its `addEventListener` calls, not just handed
 *  the node via a `.current` assignment (which is a no-op: it sets a property on the
 *  function object without ever calling it, so the dispatch below would land on an
 *  element with no listeners attached). */
function ForcePlaying() {
  const clock = usePlayback();
  return (
    <audio
      ref={(el) => {
        if (!el) return;
        clock.ref(el);
        el.dispatchEvent(new Event("play"));
      }}
    />
  );
}

describe("ChartContextBar", () => {
  it("shows the song and its actions", () => {
    render(<Harness playing={false} />);
    expect(screen.getByRole("heading", { name: "Song.m4a" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Practice mode" })).toBeInTheDocument();
  });

  it("marks itself as receded while the song plays", () => {
    // In play-along your eyes are on your hands. Chrome you are not using is chrome in the
    // way — the SAME instinct as the screen-reader rule that the app stays quiet while
    // playing. When two constraints want the same thing, it is a real principle.
    //
    // It RECEDES, it does not VANISH: a control you cannot find is worse than one you can
    // ignore. CSS dims it; it stays in the DOM, focusable, and one Tab away.
    const { container } = render(<Harness playing />);
    const bar = container.querySelector(".chart-context-bar");
    expect(bar).toHaveAttribute("data-receded", "true");
    expect(screen.getByRole("button", { name: "Practice mode" })).toBeInTheDocument();
  });

  it("is not receded while paused", () => {
    const { container } = render(<Harness playing={false} />);
    expect(container.querySelector(".chart-context-bar")).not.toHaveAttribute("data-receded");
  });
});
