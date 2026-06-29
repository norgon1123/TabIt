import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import SegmentEditor from "./SegmentEditor";

const segment = {
  id: "s1", start_time: 0, end_time: 2, chord_root: "C", chord_quality: "maj", roman_numeral: "I",
};

test("saving a changed quality calls onSave with the patch", async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<SegmentEditor segment={segment} onSave={onSave} onDelete={vi.fn()} busy={false} />);
  await userEvent.selectOptions(screen.getByLabelText(/quality/i), "min");
  await userEvent.click(screen.getByRole("button", { name: /save/i }));
  expect(onSave).toHaveBeenCalledWith({ chord_root: "C", chord_quality: "min", start_time: 0, end_time: 2 });
});

test("shows a validation error from onSave", async () => {
  const onSave = vi.fn().mockRejectedValue(
    Object.assign(new Error("bad"), { name: "ApiError", status: 422, detail: "segment overlaps an existing segment" }),
  );
  render(<SegmentEditor segment={segment} onSave={onSave} onDelete={vi.fn()} busy={false} />);
  await userEvent.click(screen.getByRole("button", { name: /save/i }));
  expect(await screen.findByText(/overlaps/i)).toBeInTheDocument();
});

test("delete calls onDelete", async () => {
  const onDelete = vi.fn();
  render(<SegmentEditor segment={segment} onSave={vi.fn()} onDelete={onDelete} busy={false} />);
  await userEvent.click(screen.getByRole("button", { name: /delete/i }));
  expect(onDelete).toHaveBeenCalled();
});
