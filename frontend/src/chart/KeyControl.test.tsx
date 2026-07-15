import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KeyControl from "./KeyControl";

test("reads as text until it is clicked, then offers a tonic and a mode dropdown", async () => {
  render(<KeyControl keyTonic="C" keyMode="major" onChange={vi.fn()} busy={false} />);

  expect(screen.getByRole("button", { name: "Key: C Major" })).toHaveTextContent("C Major");
  expect(screen.queryByLabelText("Key tonic")).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /key:/i }));
  expect((screen.getByLabelText("Key tonic") as HTMLSelectElement).value).toBe("C");
  expect((screen.getByLabelText("Key mode") as HTMLSelectElement).value).toBe("major");
});

test("patches the tonic and the mode independently", async () => {
  const onChange = vi.fn();
  render(<KeyControl keyTonic="C" keyMode="major" onChange={onChange} busy={false} />);
  await userEvent.click(screen.getByRole("button", { name: /key:/i }));

  await userEvent.selectOptions(screen.getByLabelText("Key tonic"), "Eb");
  expect(onChange).toHaveBeenCalledWith({ key_tonic: "Eb" });

  await userEvent.selectOptions(screen.getByLabelText("Key mode"), "minor");
  expect(onChange).toHaveBeenCalledWith({ key_mode: "minor" });
});

test("moving between the two dropdowns keeps the editor open", async () => {
  render(<KeyControl keyTonic="C" keyMode="major" onChange={vi.fn()} busy={false} />);
  await userEvent.click(screen.getByRole("button", { name: /key:/i }));

  const tonic = screen.getByLabelText("Key tonic");
  const mode = screen.getByLabelText("Key mode");
  fireEvent.blur(tonic, { relatedTarget: mode });

  expect(screen.getByLabelText("Key mode")).toBeInTheDocument();
});

test("clicking away closes the editor", async () => {
  render(<KeyControl keyTonic="C" keyMode="major" onChange={vi.fn()} busy={false} />);
  await userEvent.click(screen.getByRole("button", { name: /key:/i }));

  fireEvent.mouseDown(document.body);

  expect(screen.queryByLabelText("Key tonic")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /key:/i })).toBeInTheDocument();
});

test("Enter closes the editor", async () => {
  render(<KeyControl keyTonic="C" keyMode="major" onChange={vi.fn()} busy={false} />);
  await userEvent.click(screen.getByRole("button", { name: /key:/i }));

  fireEvent.keyDown(screen.getByLabelText("Key tonic"), { key: "Enter" });

  expect(screen.queryByLabelText("Key tonic")).not.toBeInTheDocument();
});

// A save re-renders the sheet with `busy` up — which is any edit anywhere, not just this
// one. The editor used to disable its dropdowns then, and a disabled control drops the
// browser's focus, so the blur and the Enter that were meant to close it never arrived and
// the key was stuck open as a pair of dropdowns.
test("stays usable and closeable while a save is in flight", async () => {
  const { rerender } = render(
    <KeyControl keyTonic="C" keyMode="major" onChange={vi.fn()} busy={false} />,
  );
  await userEvent.click(screen.getByRole("button", { name: /key:/i }));

  rerender(<KeyControl keyTonic="Eb" keyMode="major" onChange={vi.fn()} busy />);
  expect(screen.getByLabelText("Key tonic")).toBeEnabled();

  fireEvent.keyDown(document, { key: "Enter" });
  expect(screen.queryByLabelText("Key tonic")).not.toBeInTheDocument();
});

test("shows the saved key after a mode change", () => {
  render(<KeyControl keyTonic="A" keyMode="minor" onChange={vi.fn()} busy={false} />);
  expect(screen.getByRole("button", { name: /key:/i })).toHaveTextContent("A Minor");
});

test("is not editable while a mutation is in flight", () => {
  render(<KeyControl keyTonic="A" keyMode="minor" onChange={vi.fn()} busy />);
  expect(screen.getByRole("button", { name: /key:/i })).toBeDisabled();
});

test("returns focus to the trigger when the editor closes", async () => {
  // Closing with Escape (or Enter/click-away) used to leave focus on document.body, so a
  // keyboard user had to Tab back from the top. Focus now returns to the key button.
  render(<KeyControl keyTonic="C" keyMode="major" onChange={vi.fn()} busy={false} />);
  await userEvent.click(screen.getByRole("button", { name: /key:/i }));
  await userEvent.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: /key:/i })).toHaveFocus();
});
