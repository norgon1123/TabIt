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

  it("keeps `top` as an inline style — it is a measured offset, not a design value", () => {
    // Phase 2 replaces this whole mechanism with a docked panel. Until then the measured
    // pixel offset is legitimate runtime geometry and must stay inline.
    const { container } = render(<Panel title="Edit segment" top={120} />);
    expect((container.firstElementChild as HTMLElement).style.top).toBe("120px");
  });
});
