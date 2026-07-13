import { paintChordFill } from "./chordProgress";

// jsdom runs no transitions, so what we can observe is the layout read that commits the
// start value. Record the transform the element carried at each flush.
function fillElement(): { el: HTMLElement; flushed: string[] } {
  const el = document.createElement("span");
  const flushed: string[] = [];
  Object.defineProperty(el, "offsetWidth", {
    get() {
      flushed.push(el.style.transform);
      return 0;
    },
  });
  return { el, flushed };
}

test("snaps to the played fraction and does not arm a transition while paused", () => {
  const { el, flushed } = fillElement();
  paintChordFill(el, { startTime: 2, endTime: 4, currentTime: 3, playing: false, rate: 1 });
  expect(el.style.transform).toBe("scaleX(0.5)");
  expect(el.style.transition).toBe("none");
  expect(flushed).toEqual(["scaleX(0.5)"]);
});

test("commits an empty bar before arming the fill of a chord that just started", () => {
  const { el, flushed } = fillElement();
  paintChordFill(el, { startTime: 2, endTime: 4, currentTime: 2, playing: true, rate: 1 });
  expect(flushed).toEqual(["scaleX(0)"]);
  expect(el.style.transform).toBe("scaleX(1)");
  expect(el.style.transition).toBe("transform 2s linear");
});

test("a mid-chord seek fills from where it landed, over what is left", () => {
  const { el, flushed } = fillElement();
  paintChordFill(el, { startTime: 2, endTime: 4, currentTime: 3.5, playing: true, rate: 1 });
  expect(flushed).toEqual(["scaleX(0.75)"]); // the browser starts from 75%...
  expect(el.style.transition).toBe("transform 0.5s linear"); // ...and has 0.5s left to run
});

test("clamps a clock reading that still lags behind the chord boundary", () => {
  const { el, flushed } = fillElement();
  // timeupdate is ~4Hz: the chord can flip at t=2 while the clock still reads 1.8.
  paintChordFill(el, { startTime: 2, endTime: 4, currentTime: 1.8, playing: true, rate: 1 });
  expect(flushed).toEqual(["scaleX(0)"]); // never negative, never full
  expect(el.style.transition).toBe("transform 2s linear"); // the chord's length, not 2.2s
});

test("scales the fill's duration by the playback rate", () => {
  const { el } = fillElement();
  paintChordFill(el, { startTime: 0, endTime: 4, currentTime: 1, playing: true, rate: 2 });
  expect(el.style.transition).toBe("transform 1.5s linear"); // 3s of audio at 2x
});

test("survives a zero-length chord without dividing by zero", () => {
  const { el, flushed } = fillElement();
  paintChordFill(el, { startTime: 2, endTime: 2, currentTime: 2, playing: true, rate: 1 });
  expect(flushed).toEqual(["scaleX(0)"]);
  expect(el.style.transition).toBe("transform 0s linear");
});
