import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils";
import ModeChoice from "./ModeChoice";

test("asks the question and reports which door was taken", async () => {
  const onChoose = vi.fn();
  renderWithProviders(<ModeChoice onChoose={onChoose} />);

  expect(screen.getByRole("heading", { name: /how do you want to open this song/i }))
    .toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /practice mode/i }));
  expect(onChoose).toHaveBeenCalledWith("practice");

  await userEvent.click(screen.getByRole("button", { name: /open the chart/i }));
  expect(onChoose).toHaveBeenCalledWith("edit");
});

// The guest (logged out — the test's default) is asked exactly as a member is.
test("a guest is offered practice mode under the shipped policy", () => {
  renderWithProviders(<ModeChoice onChoose={vi.fn()} />);
  expect(screen.getByRole("button", { name: /practice mode/i })).toBeEnabled();
});

// The pro-feature future, rendered for real: flipping PRACTICE_ACCESS to "members" is the
// only change needed to ship this, and here is what a guest would then see.
test("when the gate locks practice mode, the option is shown disabled with a route to an account", () => {
  renderWithProviders(<ModeChoice onChoose={vi.fn()} access="members" />);

  expect(screen.getByRole("button", { name: /practice mode/i })).toBeDisabled();
  expect(screen.getByText(/comes with an account/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /create an account/i })).toHaveAttribute(
    "href",
    "/register",
  );
});
