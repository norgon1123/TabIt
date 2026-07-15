import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
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

// Stands in for ChordGuess, which closes itself on a `window.setTimeout` after a correct
// answer — nobody clicks anything inside the panel. We model that by driving `open` to
// false via a plain module-level setter rather than a click, so no jsdom click-focus
// side effect can sneak in and mask the bug.
let externalClose: (() => void) | null = null;

function HarnessWithElsewhere() {
  const [open, setOpen] = useState(false);
  const ref = useReturnFocus<HTMLDivElement>(open);
  externalClose = () => setOpen(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <button>Elsewhere</button>
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

  it("does not yank focus back if the user has already moved on", async () => {
    // ChordGuess closes itself on a TIMER after a correct answer. If a keyboard user Tabs
    // away while the reveal plays out, the close must not drag them back to the chord cell
    // they had already left. Being helpful against someone's wishes is just being rude.
    render(<HarnessWithElsewhere />);

    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByTestId("panel")).toHaveFocus();

    // The user Tabs away to an unrelated control...
    screen.getByRole("button", { name: "Elsewhere" }).focus();
    expect(screen.getByRole("button", { name: "Elsewhere" })).toHaveFocus();

    // ...and THEN the panel closes on its own (a timer, not a click).
    await act(async () => {
      externalClose?.();
    });

    expect(screen.getByRole("button", { name: "Elsewhere" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Open" })).not.toHaveFocus();
  });

  it("still returns focus in the normal case — closed from inside the panel", async () => {
    // The common path must keep working: press Escape or the close button while focus is
    // still in the panel, and you land back on the control you came from.
    render(<HarnessWithElsewhere />);
    const opener = screen.getByRole("button", { name: "Open" });

    await userEvent.click(opener);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(opener).toHaveFocus();
  });
});
