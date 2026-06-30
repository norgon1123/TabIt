import { render, screen, fireEvent } from "@testing-library/react";
import ScrubBar from "./ScrubBar";

function mockRect(el: Element, left: number, width: number) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left,
    width,
    top: 0,
    right: left + width,
    bottom: 14,
    height: 14,
    x: left,
    y: 0,
    toJSON: () => {},
  } as DOMRect);
}

test("clicking the track seeks to that fraction of the duration", () => {
  const onSeek = vi.fn();
  render(<ScrubBar currentTime={0} duration={10} playing={false} rate={1} onSeek={onSeek} />);
  const slider = screen.getByRole("slider");
  mockRect(slider, 0, 200);
  fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 });
  expect(onSeek).toHaveBeenCalledWith(5);
});

test("dragging scrubs continuously", () => {
  const onSeek = vi.fn();
  render(<ScrubBar currentTime={0} duration={10} playing={false} rate={1} onSeek={onSeek} />);
  const slider = screen.getByRole("slider");
  mockRect(slider, 0, 200);
  fireEvent.pointerDown(slider, { clientX: 0, pointerId: 1 });
  fireEvent.pointerMove(slider, { clientX: 150, pointerId: 1 });
  expect(onSeek).toHaveBeenLastCalledWith(7.5);
});

test("reflects the current fraction on the fill when paused", () => {
  const { container } = render(
    <ScrubBar currentTime={5} duration={10} playing={false} rate={1} onSeek={() => {}} />,
  );
  const fill = container.querySelector(".scrub-fill") as HTMLElement;
  expect(fill.style.transform).toBe("scaleX(0.5)");
});

test("ignores seeks before duration is known", () => {
  const onSeek = vi.fn();
  render(<ScrubBar currentTime={0} duration={0} playing={false} rate={1} onSeek={onSeek} />);
  const slider = screen.getByRole("slider");
  mockRect(slider, 0, 200);
  fireEvent.pointerDown(slider, { clientX: 100, pointerId: 1 });
  expect(onSeek).not.toHaveBeenCalled();
});
