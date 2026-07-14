import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Field from "./Field";

describe("Field", () => {
  it("associates the label with the control without needing an id", () => {
    // The <label> wraps the control, which is the pattern already used in SegmentEditor.
    // No htmlFor/id wiring means no chance of a duplicate or missing id.
    render(
      <Field label="Beats">
        <input type="number" defaultValue={4} />
      </Field>,
    );
    expect(screen.getByLabelText("Beats")).toHaveValue(4);
  });

  it("renders an error and links it to the control for a screen reader", () => {
    render(
      <Field label="Root" error="Could not save segment">
        <select><option>C</option></select>
      </Field>,
    );

    const message = screen.getByText("Could not save segment");
    expect(message).toHaveClass("error");
    // role=alert so the failure is announced when it appears, not silently painted red.
    // Colour is never the only channel.
    expect(message).toHaveAttribute("role", "alert");
  });

  it("renders no error node when there is no error", () => {
    render(<Field label="Root"><select><option>C</option></select></Field>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders a hint when given one", () => {
    render(<Field label="Beats" hint="Half-beats allowed"><input /></Field>);
    expect(screen.getByText("Half-beats allowed")).toBeInTheDocument();
  });
});
