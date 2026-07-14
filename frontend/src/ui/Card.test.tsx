import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Card from "./Card";

describe("Card", () => {
  it("renders its children inside a .card", () => {
    render(<Card><span>content</span></Card>);
    expect(screen.getByText("content").closest(".card")).toBeInTheDocument();
  });

  it("carries padding as a data attribute, not an inline style", () => {
    const { container } = render(<Card padding={5} />);
    const el = container.firstElementChild!;
    expect(el.getAttribute("data-padding")).toBe("5");
    expect(el.getAttribute("style")).toBeNull();
  });

  it("passes through className and arbitrary props", () => {
    render(<Card className="chart-panel" data-testid="c" />);
    expect(screen.getByTestId("c")).toHaveClass("card", "chart-panel");
  });
});
