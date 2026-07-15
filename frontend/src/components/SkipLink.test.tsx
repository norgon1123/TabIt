import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SkipLink from "./SkipLink";

describe("SkipLink", () => {
  it("is a link that targets the main landmark", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: /skip to content/i });
    expect(link).toHaveAttribute("href", "#main-content");
  });
});
