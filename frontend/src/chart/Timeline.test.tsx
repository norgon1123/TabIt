import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Timeline from "./Timeline";
import { beatSlashMarks } from "./beatMath";
import type { BeatGridInfo } from "./musicalPosition";

const segments = [
  { id: "s1", start_beat: 0, end_beat: 4, start_time: 0, end_time: 2, chord_root: "C", chord_quality: "maj", roman_numeral: "I" },
  { id: "s2", start_beat: 4, end_beat: 8, start_time: 2, end_time: 4, chord_root: "G", chord_quality: "maj", roman_numeral: "V" },
];

// bpm 120 -> a beat every 0.5s; beatsPerMeasure 4, no pickup. Matches `segments` above:
// s1 starts at t=0 (bar 1, beat 1), s2 starts at t=2 (bar 2, beat 1).
const GRID: BeatGridInfo = {
  beatTimes: Array.from({ length: 9 }, (_, i) => i * 0.5),
  bpm: 120,
  duration: 4,
  beatsPerMeasure: 4,
  measureOffset: 0,
};

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
      grid={GRID}
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

// Fixture shared by the width-guard test below — this file has no module-level BASE, so
// one is built locally rather than disturbing the fixtures every other test already uses.
const BASE = { chord_root: "C", chord_quality: "maj", roman_numeral: "I" };

it("sizes each cell by its beat count — the width IS the rhythm", () => {
  // A 4-beat chord must be twice as wide as a 2-beat one. That is not decoration: it is how
  // the chart shows rhythm.
  //
  // The ratio must sit on the .chord-cell__item wrapper, because THAT is the flex child of
  // the .chart-line row. If it drifts back onto the <button>, the wrapper falls back to
  // `flex: 0 1 auto`, sizes to its content, and every chord renders the same width — the
  // chart silently stops showing rhythm. jsdom does no layout, so this test is the only
  // thing standing between that regression and production: it must name the exact element,
  // not accept the ratio "wherever it landed". An earlier version of this test did the
  // latter and was green even with the ratio on the wrong element.
  const segs = [
    { ...BASE, id: "s1", start_beat: 0, end_beat: 4, start_time: 0, end_time: 2 },
    { ...BASE, id: "s2", start_beat: 4, end_beat: 6, start_time: 2, end_time: 3 },
  ];
  renderTimeline({ segments: segs });

  const buttonFor = (id: string) =>
    document.querySelector<HTMLElement>(`[data-segment-id="${id}"]`)!;
  const wrapperFor = (id: string) => buttonFor(id).closest<HTMLElement>(".chord-cell__item")!;

  // jsdom's CSSOM normalises the flex shorthand's zero flex-basis to "0px" (confirmed by
  // setting el.style.flex directly — it is a serialisation quirk of this test environment,
  // not a property of which element carries the ratio), so the expected strings say "0px"
  // rather than the literal "0". The ratio under test — 4:1 vs 2:1 — is unchanged.
  //
  // The ratio is on the flex child...
  expect(wrapperFor("s1").style.flex).toBe("4 1 0px");
  expect(wrapperFor("s2").style.flex).toBe("2 1 0px");

  // ...and NOT on the button, which is not the flex child and would size to content.
  expect(buttonFor("s1").style.flex).toBe("");
  expect(buttonFor("s2").style.flex).toBe("");

  // And the wrapper really is a child of the flex row, not floating somewhere else.
  expect(wrapperFor("s1").parentElement).toHaveClass("chart-line");
});

describe("the chart is a semantic sequence, not a pile of divs", () => {
  it("names itself, so a screen-reader user can find it", () => {
    renderTimeline();
    expect(screen.getByRole("list", { name: /chord chart/i })).toBeInTheDocument();
  });

  it("tells a player where each chord IS, how long it lasts, and whether a bar starts", () => {
    // "C, button" is what the chart said before. It gave a blind or low-vision player no
    // idea where in the song they were, how long to stay on the chord, or that a bar
    // started there. All three are things a sighted player reads off the page instantly.
    renderTimeline();
    const cells = screen.getAllByRole("button", { name: /bar \d+/i });
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0]).toHaveAccessibleName(/bar 1, beat 1/i);
    expect(cells[0]).toHaveAccessibleName(/beats/i);
  });

  it("says a bar starts here, without relying on the colour that says so visually", () => {
    // The measure rule is a graphical object. A screen reader cannot see 3px of --bar-line.
    renderTimeline();
    const barStart = screen.getAllByRole("button", { name: /starts a bar/i });
    expect(barStart.length).toBeGreaterThan(0);
  });

  it("keeps a masked chord's secret while still saying where it is", () => {
    // Practice mode: the chord is the question. The position and the length are the
    // question's CONTEXT and must survive — a player needs the rhythm to guess against.
    renderTimeline({ maskedIds: new Set(["s1"]) });
    const masked = screen.getByRole("button", { name: /hidden chord/i });
    expect(masked).toHaveAccessibleName(/bar 1/i);
    expect(masked).not.toHaveAccessibleName(/major|minor|\bC\b/i);
  });
});
