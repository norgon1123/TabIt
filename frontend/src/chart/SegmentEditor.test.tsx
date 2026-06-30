import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SegmentEditor from "./SegmentEditor";

const seg = {
  id: "s1", start_beat: 0, end_beat: 4, start_time: 0, end_time: 2,
  chord_root: "C", chord_quality: "maj", roman_numeral: "I",
};

describe("SegmentEditor beats", () => {
  it("saves a new beat length as end_beat = start_beat + count", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<SegmentEditor segment={seg} onSave={onSave} onDelete={() => {}} busy={false} />);
    const beats = screen.getByLabelText(/beats/i) as HTMLInputElement;
    fireEvent.change(beats, { target: { value: "2" } });
    fireEvent.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ end_beat: 2 }));
  });
});
