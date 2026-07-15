import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TransposeControl from "./TransposeControl";

test("up button transposes +1 and down transposes -1", async () => {
  const onTranspose = vi.fn();
  render(<TransposeControl onTranspose={onTranspose} busy={false} />);
  await userEvent.click(screen.getByRole("button", { name: /\+1/ }));
  expect(onTranspose).toHaveBeenCalledWith(1);
  await userEvent.click(screen.getByRole("button", { name: /−1|-1/ }));
  expect(onTranspose).toHaveBeenCalledWith(-1);
});

test("names its transpose buttons for a screen reader", () => {
  // "−1, button" tells a screen-reader user nothing about direction or units.
  render(<TransposeControl onTranspose={vi.fn()} busy={false} />);
  expect(screen.getByRole("button", { name: /transpose down a semitone/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /transpose up a semitone/i })).toBeInTheDocument();
});
