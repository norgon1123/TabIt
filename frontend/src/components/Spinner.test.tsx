import { render, screen } from "@testing-library/react";
import Spinner from "./Spinner";

test("renders an accessible status role with default label", () => {
  render(<Spinner />);
  expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
});

test("uses a custom label when provided", () => {
  render(<Spinner label="Analyzing" />);
  expect(screen.getByRole("status", { name: /analyzing/i })).toBeInTheDocument();
});
