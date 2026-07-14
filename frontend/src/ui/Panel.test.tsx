import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Panel from "./Panel";

describe("Panel", () => {
  it("renders its title and children", () => {
    render(<Panel title="Edit segment"><span>body</span></Panel>);
    expect(screen.getByText("Edit segment")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("names itself for a screen reader", () => {
    // A panel that appears beside the chart needs to announce what it is when focus
    // lands in it, otherwise it is an unlabelled box of controls.
    render(<Panel title="Edit segment" />);
    expect(screen.getByRole("group", { name: "Edit segment" })).toBeInTheDocument();
  });

  it("shows a close button only when it can close", () => {
    const { rerender } = render(<Panel title="Edit segment" />);
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();

    const onClose = vi.fn();
    rerender(<Panel title="Edit segment" onClose={onClose} />);
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("closes when the close button is pressed", async () => {
    const onClose = vi.fn();
    render(<Panel title="Edit segment" onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("carries no inline style at all — the docked panel is positioned by CSS", () => {
    // Phase 1 kept ONE sanctioned inline style here: a pixel offset measured from the DOM,
    // recomputed on every chart change and window resize, to line the panel up with its
    // chord's row. Phase 2 docks the panel, so that offset is dead — and with it the last
    // inline style in src/ui.
    const { container } = render(<Panel title="Edit segment" />);
    expect((container.firstElementChild as HTMLElement).getAttribute("style")).toBeNull();
  });

  it("still lets a caller pass their own style through", () => {
    const { container } = render(<Panel title="Edit segment" style={{ color: "red" }} />);
    expect((container.firstElementChild as HTMLElement).style.color).toBe("red");
  });

  it("does not let a caller strip its accessible name", () => {
    // role=group + aria-label are why a screen reader announces "Edit segment" rather than
    // reading out an unlabelled box of selects. They are not negotiable by a caller.
    render(<Panel title="Edit segment" {...({ "aria-label": "Something else" } as object)} />);
    expect(screen.getByRole("group", { name: "Edit segment" })).toBeInTheDocument();
  });
});
