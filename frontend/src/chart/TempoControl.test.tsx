import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import TempoControl from "./TempoControl";

describe("TempoControl", () => {
  test("halves the tempo — the fix for a double-time beat grid", () => {
    const onChange = vi.fn();
    render(<TempoControl bpm={143.6} onChange={onChange} busy={false} />);
    fireEvent.click(screen.getByTitle("Half-time"));
    expect(onChange).toHaveBeenCalledWith(71.8);
  });

  test("doubles the tempo", () => {
    const onChange = vi.fn();
    render(<TempoControl bpm={71.8} onChange={onChange} busy={false} />);
    fireEvent.click(screen.getByTitle("Double-time"));
    expect(onChange).toHaveBeenCalledWith(143.6);
  });

  test("commits a typed tempo on Enter", () => {
    const onChange = vi.fn();
    render(<TempoControl bpm={143.6} onChange={onChange} busy={false} />);
    const input = screen.getByLabelText("Tempo:");
    fireEvent.change(input, { target: { value: "74" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(74);
  });

  test("rejects an implausible tempo and snaps back", () => {
    const onChange = vi.fn();
    render(<TempoControl bpm={143.6} onChange={onChange} busy={false} />);
    const input = screen.getByLabelText("Tempo:") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "9999" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("143.6");
  });

  test("does not fire when the tempo is unchanged", () => {
    const onChange = vi.fn();
    render(<TempoControl bpm={143.6} onChange={onChange} busy={false} />);
    fireEvent.blur(screen.getByLabelText("Tempo:"));
    expect(onChange).not.toHaveBeenCalled();
  });

  test("renders nothing when there is no tempo to rescale from", () => {
    const { container } = render(<TempoControl bpm={null} onChange={vi.fn()} busy={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("clamps a halved tempo to the minimum the API accepts", () => {
    const onChange = vi.fn();
    render(<TempoControl bpm={30} onChange={onChange} busy={false} />);
    fireEvent.click(screen.getByTitle("Half-time"));
    expect(onChange.mock.calls[0][0]).toBeGreaterThan(20);
  });
});
