import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Stack from "./Stack";

describe("Stack", () => {
  it("renders its children", () => {
    render(<Stack><span>hello</span></Stack>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("carries its spacing as data attributes, not inline styles", () => {
    // The whole point: a Stack must be themeable and restyleable from CSS. If it wrote
    // gap:12px inline, Phase 2 could not retarget it and a theme could not touch it.
    const { container } = render(<Stack gap={4} direction="column" />);
    const el = container.firstElementChild!;

    expect(el).toHaveClass("stack");
    expect(el.getAttribute("data-gap")).toBe("4");
    expect(el.getAttribute("data-direction")).toBe("column");
    expect(el.getAttribute("style")).toBeNull();
  });

  it("defaults to a centred, non-wrapping row with gap 3", () => {
    const { container } = render(<Stack />);
    const el = container.firstElementChild!;

    expect(el.getAttribute("data-direction")).toBe("row");
    expect(el.getAttribute("data-gap")).toBe("3");
    expect(el.getAttribute("data-align")).toBe("center");
    expect(el.getAttribute("data-wrap")).toBeNull();
  });

  it("marks wrapping only when asked", () => {
    const { container } = render(<Stack wrap />);
    expect(container.firstElementChild!.getAttribute("data-wrap")).toBe("true");
  });

  it("renders as a semantic element when asked", () => {
    // Header's nav is a <nav>. A Stack must not force everything to be a <div>.
    render(<Stack as="nav" aria-label="Main" />);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });

  it("passes through arbitrary props", () => {
    render(<Stack data-testid="s" className="extra" />);
    expect(screen.getByTestId("s")).toHaveClass("stack", "extra");
  });
});
