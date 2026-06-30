import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Timeline from "./Timeline";

const segments = [
  { id: "s1", start_time: 0, end_time: 2, chord_root: "C", chord_quality: "maj", roman_numeral: "I" },
  { id: "s2", start_time: 2, end_time: 4, chord_root: "G", chord_quality: "maj", roman_numeral: "V" },
];

function renderTimeline(props: Partial<React.ComponentProps<typeof Timeline>> = {}) {
  return render(
    <Timeline
      segments={segments}
      bpm={120}
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

test("highlights the chord under the playhead (#3)", () => {
  const { container } = renderTimeline({ currentTime: 3 }); // inside s2 [2,4)
  const playing = container.querySelectorAll(".playing");
  expect(playing).toHaveLength(1);
  expect(playing[0]).toHaveAttribute("data-segment-id", "s2");
});

test("renders resize handles on each edge when resizable (#2)", () => {
  renderTimeline({ onResizeCommit: vi.fn() });
  expect(screen.getByLabelText("Resize start of C")).toBeInTheDocument();
  expect(screen.getByLabelText("Resize end of C")).toBeInTheDocument();
});

test("dragging a chord past another reorders by insert (round 2 #4)", () => {
  const onReorder = vi.fn();
  const { container } = renderTimeline({ onReorder });
  const cellC = container.querySelector('[data-segment-id="s1"]')!;
  const cellG = container.querySelector('[data-segment-id="s2"]') as HTMLElement;
  fireEvent.dragStart(cellC);
  // A real MouseEvent carries clientX (fireEvent.dragOver drops it); past the midpoint → after s2.
  fireEvent(cellG, new MouseEvent("dragover", { bubbles: true, clientX: 80 }));
  fireEvent.drop(cellG);
  expect(onReorder).toHaveBeenCalledWith(["s2", "s1"]);
});

test("shows a progress bar across the chord under the playhead (round 2 #2)", () => {
  const { container } = renderTimeline({ currentTime: 3 }); // halfway through s2 [2,4)
  const bar = container.querySelector('[data-segment-id="s2"] .chord-progress') as HTMLElement;
  expect(bar).toBeInTheDocument();
  expect(bar.style.width).toBe("50%");
});
