import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import useReturnFocus from "./useReturnFocus";

function Harness() {
  const [open, setOpen] = useState(false);
  const ref = useReturnFocus<HTMLDivElement>(open);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <div ref={ref} tabIndex={-1} data-testid="panel">
          <button onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </>
  );
}

describe("useReturnFocus", () => {
  it("moves focus into the panel when it opens", async () => {
    // Without this, a keyboard user presses Enter on a chord, the editor appears, and
    // their focus is still on the chord. The panel may as well not exist.
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByTestId("panel")).toHaveFocus();
  });

  it("returns focus to whatever opened it when it closes", async () => {
    // Without this, closing dumps the user at the top of the document and they have to
    // Tab all the way back to where they were.
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await userEvent.click(opener);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(opener).toHaveFocus();
  });

  it("does not steal focus while closed", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Open" })).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });
});
