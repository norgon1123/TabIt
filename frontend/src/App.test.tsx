import { screen } from "@testing-library/react";
import { renderWithProviders } from "./test/utils";
import App from "./App";

test("logged-out user landing on / sees the login page", async () => {
  renderWithProviders(<App />, { route: "/" });
  expect(await screen.findByRole("heading", { name: /log in/i })).toBeInTheDocument();
});
