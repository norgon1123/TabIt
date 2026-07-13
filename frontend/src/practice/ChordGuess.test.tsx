import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChordGuess from "./ChordGuess";
import type { SegmentOut } from "../api/types";

const SEGMENT: SegmentOut = {
  id: "s1",
  start_beat: 0,
  end_beat: 4,
  start_time: 0,
  end_time: 2,
  chord_root: "G",
  chord_quality: "dom7",
  roman_numeral: "V7",
};

async function guess(root: string, quality: string) {
  await userEvent.selectOptions(screen.getByLabelText("Root"), root);
  await userEvent.selectOptions(screen.getByLabelText("Quality"), quality);
  await userEvent.click(screen.getByRole("button", { name: "Submit" }));
}

test("a wrong answer is refused, marked invalid, and shakes", async () => {
  const onSolved = vi.fn();
  const { container } = render(<ChordGuess segment={SEGMENT} onSolved={onSolved} />);

  await guess("C", "Major");

  expect(await screen.findByRole("alert")).toHaveTextContent(/not that one/i);
  expect(container.querySelector(".chord-guess--wrong")).not.toBeNull();
  expect(container.querySelector(".chord-guess.shake")).not.toBeNull();
  expect(screen.getByLabelText("Root")).toHaveAttribute("aria-invalid", "true");
  // The chord is not given away, and the form stays up for another attempt.
  expect(onSolved).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
});

test("a second wrong answer shakes again", async () => {
  const { container } = render(<ChordGuess segment={SEGMENT} onSolved={vi.fn()} />);

  await guess("C", "Major");
  const card = container.querySelector(".chord-guess")!;
  // The class is re-applied around a forced reflow, so it is on the element both times —
  // what proves the replay is that touching a field clears the verdict and the next wrong
  // answer sets it afresh.
  await userEvent.selectOptions(screen.getByLabelText("Root"), "D");
  expect(card.className).not.toMatch(/chord-guess--wrong/);

  await userEvent.click(screen.getByRole("button", { name: "Submit" }));
  expect(card.className).toMatch(/chord-guess--wrong/);
  expect(card.className).toMatch(/shake/);
});

test("the right answer is confirmed in green, then reveals the chord", async () => {
  const onSolved = vi.fn();
  const { container } = render(
    <ChordGuess segment={SEGMENT} onSolved={onSolved} revealMs={10} />,
  );

  await guess("G", "Dominant 7th");

  // Named in full, so the player reads back what they just worked out.
  expect(await screen.findByRole("status")).toHaveTextContent("Gdom7");
  expect(container.querySelector(".chord-guess--right")).not.toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();

  // The form hands the chord to the chart and dismisses itself.
  await waitFor(() => expect(onSolved).toHaveBeenCalledWith("s1"));
});

// Db on the chart, C# in the player's hands: the same chord.
test("an enharmonic answer is accepted", async () => {
  const onSolved = vi.fn();
  const flat: SegmentOut = { ...SEGMENT, chord_root: "Db", chord_quality: "maj" };
  render(<ChordGuess segment={flat} onSolved={onSolved} revealMs={10} />);

  await guess("C#", "Major");

  await waitFor(() => expect(onSolved).toHaveBeenCalledWith("s1"));
});
