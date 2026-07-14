import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Timeline from "./Timeline";
import { beatSlashMarks } from "./beatMath";

const segments = [
  { id: "s1", start_beat: 0, end_beat: 4, start_time: 0, end_time: 2, chord_root: "C", chord_quality: "maj", roman_numeral: "I" },
  { id: "s2", start_beat: 4, end_beat: 8, start_time: 2, end_time: 4, chord_root: "G", chord_quality: "maj", roman_numeral: "V" },
];

function renderTimeline(props: Partial<React.ComponentProps<typeof Timeline>> = {}) {
  return render(
    <Timeline
      segments={segments}
      beatsPerMeasure={4}
      measureOffset={0}
      duration={4}
      currentTime={0}
      selectedId={null}
      onSelect={() => {}}
      {...props}
    />,
  );
}

test("renders each segment's chord and roman numeral", () => {
  renderTimeline();
  expect(screen.getByText("C")).toBeInTheDocument();
  expect(screen.getByText("I")).toBeInTheDocument();
  expect(screen.getByText("G")).toBeInTheDocument();
  expect(screen.getByText("V")).toBeInTheDocument();
});

test("clicking a segment selects it and seeks to its start (#8)", async () => {
  const onSelect = vi.fn();
  const onSeek = vi.fn();
  renderTimeline({ onSelect, onSeek });
  await userEvent.click(screen.getByText("G"));
  expect(onSelect).toHaveBeenCalledWith("s2");
  expect(onSeek).toHaveBeenCalledWith(2);
});

test("a keyboard user can tab to a chord and press Enter to select it", async () => {
  // The chord cells are real <button>s for exactly this reason: in practice mode,
  // clicking a chord *is* the question, and a keyboard user has no other way to reach it.
  const onSelect = vi.fn();
  const onSeek = vi.fn();
  renderTimeline({ onSelect, onSeek });
  await userEvent.tab();
  expect(document.activeElement).toHaveAttribute("data-segment-id", "s1");
  await userEvent.keyboard("{Enter}");
  expect(onSelect).toHaveBeenCalledWith("s1");
  expect(onSeek).toHaveBeenCalledWith(0);
});

test("highlights the chord under the playhead (#3)", () => {
  const { container } = renderTimeline({ currentTime: 3 }); // inside s2 [2,4)
  const playing = container.querySelectorAll('[data-playing="true"]');
  expect(playing).toHaveLength(1);
  expect(playing[0]).toHaveAttribute("data-segment-id", "s2");
});

test("renders resize handles on each edge when resizable (#2)", () => {
  renderTimeline({ onResizeCommit: vi.fn() });
  expect(screen.getByLabelText("Resize start of C")).toBeInTheDocument();
  expect(screen.getByLabelText("Resize end of C")).toBeInTheDocument();
});

test("fills the active chord's progress bar to the current fraction when paused", () => {
  const { container } = renderTimeline({ currentTime: 3 }); // halfway through s2 [2,4)
  const bar = container.querySelector('[data-segment-id="s2"] .chord-progress') as HTMLElement;
  expect(bar).toBeInTheDocument();
  // Paused: the fill snaps (no compositor transition) to the true fraction via scaleX.
  expect(bar.style.transform).toBe("scaleX(0.5)");
});

it("marks the cell that starts a measure, so the bar line can be drawn", () => {
  // The bar line is a graphical object and gets its 3:1 contrast from --bar-line, which
  // palette.test.ts enforces. What THIS test cares about is that the right cell is
  // marked — not how many pixels wide the rule is, which is a design decision the CSS
  // is allowed to change without breaking the suite.
  //
  // NB: the module-level `segments` fixture (s1 @ beat 0, s2 @ beat 4, 4 beats/measure)
  // has BOTH cells landing on a measure boundary, so it can't distinguish "marked" from
  // "not marked" — use a fixture where only one of the two does.
  const segs = [
    { id: "s1", start_beat: 2, end_beat: 4, start_time: 1, end_time: 2, chord_root: "C", chord_quality: "maj", roman_numeral: "I" },
    { id: "s2", start_beat: 4, end_beat: 8, start_time: 2, end_time: 4, chord_root: "G", chord_quality: "maj", roman_numeral: "V" },
  ];
  const { container } = renderTimeline({ segments: segs, beatsPerMeasure: 4, measureOffset: 0 });
  const cell = (id: string) => container.querySelector(`[data-segment-id="${id}"]`) as HTMLElement;
  expect(cell("s2")).toHaveAttribute("data-bar-start", "true");
  expect(cell("s1")).not.toHaveAttribute("data-bar-start");
});

it("marks the selected cell", () => {
  const { container } = renderTimeline({ selectedId: "s1" });
  const cell = (id: string) => container.querySelector(`[data-segment-id="${id}"]`) as HTMLElement;
  expect(cell("s1")).toHaveAttribute("data-selected", "true");
});

// A CSS transition only animates when the browser already holds a computed value to
// interpolate *from*. The fill span is rendered fresh for each chord, so its start value
// has to be flushed to style before the transition toward scaleX(1) is armed — otherwise
// the browser resolves the element's style for the first time already at scaleX(1) and
// the bar appears full the instant the chord begins. jsdom does not run transitions, so
// the flush (a layout read) is what we can observe; record the fill's transform at each.
function recordFillFlushes(): string[] {
  const flushed: string[] = [];
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.classList.contains("chord-progress")) flushed.push(this.style.transform);
    return 0;
  });
  return flushed;
}

test("a newly active chord's progress bar starts empty, not full", () => {
  const flushed = recordFillFlushes();
  // Playing, playhead just inside s2 [2,4) — the chord has only just begun.
  const { container } = renderTimeline({ currentTime: 2, playing: true, rate: 1 });
  const bar = container.querySelector('[data-segment-id="s2"] .chord-progress') as HTMLElement;
  expect(bar).toBeInTheDocument();
  // The empty start value must reach the browser before the fill is armed.
  expect(flushed).toEqual(["scaleX(0)"]);
  expect(bar.style.transition).toBe("transform 2s linear");
  vi.restoreAllMocks();
});

test("the fill spans the whole chord even when the media clock lags the boundary", () => {
  vi.useFakeTimers();
  const flushed = recordFillFlushes();
  // timeupdate only fires ~4Hz, so the chord can flip on the boundary timer while the last
  // clock reading still sits inside s1. s2's bar must still start empty and run for s2's
  // full 2s — not 2.2s measured from the stale reading.
  const { container } = renderTimeline({ currentTime: 1.8, playing: true, rate: 1 });
  flushed.length = 0; // drop s1's paint; we care about the hand-off to s2
  act(() => void vi.advanceTimersByTime(250)); // boundary timer fires: active chord -> s2

  const bar = container.querySelector('[data-segment-id="s2"] .chord-progress') as HTMLElement;
  expect(bar).toBeInTheDocument();
  expect(flushed).toEqual(["scaleX(0)"]);
  expect(bar.style.transition).toBe("transform 2s linear");
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("renders slash marks for a 4-beat chord", () => {
  const segs = [{
    id: "s1", start_beat: 0, end_beat: 4, start_time: 0, end_time: 2,
    chord_root: "C", chord_quality: "maj", roman_numeral: "I",
  }];
  // Render Timeline with the new props (mirror the existing test's render call).
  renderTimeline({ segments: segs, beatsPerMeasure: 4, measureOffset: 0 });
  expect(screen.getByText(beatSlashMarks(4))).toBeInTheDocument(); // "╱ ╱ ╱ ╱"
});
