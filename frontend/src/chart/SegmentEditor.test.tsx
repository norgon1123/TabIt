import { fireEvent, render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SegmentEditor from "./SegmentEditor";

const seg = {
  id: "s1", start_beat: 0, end_beat: 4, start_time: 0, end_time: 2,
  chord_root: "C", chord_quality: "maj", roman_numeral: "I",
};
const seg2 = {
  id: "s2", start_beat: 4, end_beat: 8, start_time: 2, end_time: 4,
  chord_root: "F", chord_quality: "maj", roman_numeral: "IV",
};
const baseProps = {
  segment: seg,
  allSegments: [seg, seg2],
  maxTotalBeats: 20,
  onResize: () => {},
  onSave: vi.fn().mockResolvedValue(undefined),
  onDelete: () => {},
  busy: false,
};

describe("SegmentEditor beats", () => {
  it("redistributes beats to the following chords after the debounce", () => {
    vi.useFakeTimers();
    const onResize = vi.fn();
    render(<SegmentEditor {...baseProps} onResize={onResize} debounceMs={400} />);
    const beats = screen.getByLabelText(/beats/i) as HTMLInputElement;
    fireEvent.change(beats, { target: { value: "6" } });
    act(() => { vi.advanceTimersByTime(400); });
    expect(onResize).toHaveBeenCalledWith([
      { id: "s1", start_beat: 0, end_beat: 6 },
      { id: "s2", start_beat: 6, end_beat: 8 },
    ]);
    vi.useRealTimers();
  });

  it("calls onDelete when Delete button is clicked", () => {
    const onDelete = vi.fn();
    render(<SegmentEditor {...baseProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalled();
  });

  it("displays error message when onSave rejects", async () => {
    const onSave = vi.fn().mockRejectedValue({ detail: "nope" });
    render(<SegmentEditor {...baseProps} onSave={onSave} />);
    fireEvent.click(screen.getByText("Save"));
    expect(await screen.findByText("nope")).toBeInTheDocument();
  });
});

describe("SegmentEditor chord", () => {
  it("keeps the chord I picked when a tempo re-count rescales this segment's beats", () => {
    // Re-counting the tempo rewrites every segment's start/end beat without touching its
    // chord. That must not reach into the form and undo the chord the player just picked —
    // saving would silently PATCH the old chord back and the sheet would never change.
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<SegmentEditor {...baseProps} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(/root/i), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText(/quality/i), { target: { value: "min7" } });

    // The tempo response lands: same chord, same segment, beats rescaled 4 -> 12.
    const rescaled = { ...seg, start_beat: 0, end_beat: 12 };
    rerender(
      <SegmentEditor {...baseProps} onSave={onSave} segment={rescaled} allSegments={[rescaled, seg2]} />,
    );

    fireEvent.click(screen.getByText("Save"));

    expect(onSave).toHaveBeenCalledWith({ chord_root: "A", chord_quality: "min7" });
  });

  it("adopts the chord the server reports when it really changed (a transpose)", () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<SegmentEditor {...baseProps} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText(/root/i), { target: { value: "A" } });
    const transposed = { ...seg, chord_root: "D", roman_numeral: "II" };
    rerender(<SegmentEditor {...baseProps} onSave={onSave} segment={transposed} />);

    expect((screen.getByLabelText(/root/i) as HTMLSelectElement).value).toBe("D");
  });
});
