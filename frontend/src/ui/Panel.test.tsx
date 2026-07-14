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

  it("does not let a caller clobber the measured `top` offset", () => {
    // `top` is the one sanctioned inline style in this phase — it is what aligns the panel
    // with its chord's row. A caller passing `style` must not silently void it.
    const { container } = render(<Panel title="Edit segment" top={120} style={{ color: "red" }} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.top).toBe("120px");
    expect(el.style.color).toBe("red"); // the caller's own style still applies
  });

  it("does not let a caller strip its accessible name", () => {
    // role=group + aria-label are why a screen reader announces "Edit segment" rather than
    // reading out an unlabelled box of selects. They are not negotiable by a caller.
    render(<Panel title="Edit segment" {...({ "aria-label": "Something else" } as object)} />);
    expect(screen.getByRole("group", { name: "Edit segment" })).toBeInTheDocument();
  });
});
