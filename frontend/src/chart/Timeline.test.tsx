import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Timeline from "./Timeline";

const segments = [
  { id: "s1", start_time: 0, end_time: 2, chord_root: "C", chord_quality: "maj", roman_numeral: "I" },
  { id: "s2", start_time: 2, end_time: 4, chord_root: "G", chord_quality: "maj", roman_numeral: "V" },
];

test("renders each segment's chord and roman numeral", () => {
  render(<Timeline segments={segments} duration={4} currentTime={0} selectedId={null} onSelect={() => {}} />);
  expect(screen.getByText("C")).toBeInTheDocument();
  expect(screen.getByText("I")).toBeInTheDocument();
  expect(screen.getByText("G")).toBeInTheDocument();
  expect(screen.getByText("V")).toBeInTheDocument();
});

test("clicking a segment selects it", async () => {
  const onSelect = vi.fn();
  render(<Timeline segments={segments} duration={4} currentTime={0} selectedId={null} onSelect={onSelect} />);
  await userEvent.click(screen.getByText("G"));
  expect(onSelect).toHaveBeenCalledWith("s2");
});
