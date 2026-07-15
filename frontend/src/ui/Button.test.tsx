import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Button from "./Button";

describe("Button", () => {
  it("is a real button element", () => {
    // Load-bearing for the whole a11y story: a div with onClick is not focusable,
    // not keyboard-activatable, and invisible to a screen reader.
    render(<Button>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" }).tagName).toBe("BUTTON");
  });

  it("defaults to type=button so it cannot accidentally submit a form", () => {
    // The default HTML type is "submit". Inside the login form, a stray button would
    // submit it. This has bitten every codebase that ever shipped a form.
    render(<Button>Go</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("still allows an explicit submit", () => {
    render(<Button type="submit">Log in</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("applies its variant as a class, not an inline style", () => {
    render(<Button variant="primary">Go</Button>);
    expect(screen.getByRole("button")).toHaveClass("primary");
    expect(screen.getByRole("button").getAttribute("style")).toBeNull();
  });

  it("supports the danger and icon variants", () => {
    const { rerender } = render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole("button")).toHaveClass("danger");

    rerender(<Button variant="icon" aria-label="Close">x</Button>);
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass("icon");
  });

  it("does not fire when disabled", async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("fires on Enter, because it is a real button", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    screen.getByRole("button").focus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledOnce();
  });
});
