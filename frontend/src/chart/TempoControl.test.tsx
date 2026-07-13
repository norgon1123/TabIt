import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import TempoControl from "./TempoControl";

describe("TempoControl", () => {
  test("halves the tempo — the fix for a double-time beat grid", () => {
    const onChange = vi.fn();
    render(<TempoControl bpm={144} onChange={onChange} busy={false} />);
    fireEvent.click(screen.getByTitle("Half-time"));
    expect(onChange).toHaveBeenCalledWith(72);
  });

  test("doubles the tempo", () => {
    const onChange = vi.fn();
    render(<TempoControl bpm={72} onChange={onChange} busy={false} />);
    fireEvent.click(screen.getByTitle("Double-time"));
    expect(onChange).toHaveBeenCalledWith(144);
  });

  test("halving an odd tempo still asks for a whole number", () => {
    // Tempo is a count: half of 143 is 72 BPM, not 71.5.
    const onChange = vi.fn();
    render(<TempoControl bpm={143} onChange={onChange} busy={false} />);
    fireEvent.click(screen.getByTitle("Half-time"));
    expect(onChange).toHaveBeenCalledWith(72);
  });

  test("shows a whole tempo for a chart analysed before that rule", () => {
    render(<TempoControl bpm={143.6} onChange={vi.fn()} busy={false} />);
    expect((screen.getByLabelText("Tempo:") as HTMLInputElement).value).toBe("144");
  });

  test("commits a typed tempo on Enter", () => {
    const onChange = vi.fn();
    render(<TempoControl bpm={144} onChange={onChange} busy={false} />);
    const input = screen.getByLabelText("Tempo:");
    fireEvent.change(input, { target: { value: "74" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(74);
  });

  test("rounds a typed fractional tempo", () => {
    const onChange = vi.fn();
    render(<TempoControl bpm={144} onChange={onChange} busy={false} />);
    const input = screen.getByLabelText("Tempo:");
    fireEvent.change(input, { target: { value: "73.6" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(74);
  });

  test("rejects an implausible tempo and snaps back", () => {
    const onChange = vi.fn();
    render(<TempoControl bpm={144} onChange={onChange} busy={false} />);
    const input = screen.getByLabelText("Tempo:") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "9999" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("144");
  });

  test("does not fire when the tempo is unchanged", () => {
    const onChange = vi.fn();
    render(<TempoControl bpm={144} onChange={onChange} busy={false} />);
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
    expect(onChange.mock.calls[0][0]).toBe(21);
  });
});
