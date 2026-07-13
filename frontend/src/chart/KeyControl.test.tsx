import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KeyControl from "./KeyControl";

test("shows the current key and patches the tonic and mode independently", async () => {
  const onChange = vi.fn();
  render(<KeyControl keyTonic="C" keyMode="major" onChange={onChange} busy={false} />);

  const tonic = screen.getByLabelText("Key tonic") as HTMLSelectElement;
  const mode = screen.getByLabelText("Key mode") as HTMLSelectElement;
  expect(tonic.value).toBe("C");
  expect(mode.value).toBe("major");

  await userEvent.selectOptions(tonic, "Eb");
  expect(onChange).toHaveBeenCalledWith({ key_tonic: "Eb" });

  await userEvent.selectOptions(mode, "minor");
  expect(onChange).toHaveBeenCalledWith({ key_mode: "minor" });
});

test("selects are disabled while a mutation is in flight", () => {
  render(<KeyControl keyTonic="A" keyMode="minor" onChange={vi.fn()} busy />);
  expect(screen.getByLabelText("Key tonic")).toBeDisabled();
  expect(screen.getByLabelText("Key mode")).toBeDisabled();
});
