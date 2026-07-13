import { pixelToTime, formatTime, formatDuration } from "./timeMath";

test("pixelToTime maps within bounds", () => {
  expect(pixelToTime(50, { left: 0, width: 100 }, 10)).toBeCloseTo(5);
});

test("pixelToTime clamps to [0, duration]", () => {
  expect(pixelToTime(-20, { left: 0, width: 100 }, 10)).toBe(0);
  expect(pixelToTime(999, { left: 0, width: 100 }, 10)).toBe(10);
});

test("pixelToTime handles zero-width container", () => {
  expect(pixelToTime(10, { left: 0, width: 0 }, 10)).toBe(0);
});

test("formatTime renders mm:ss", () => {
  expect(formatTime(0)).toBe("0:00");
  expect(formatTime(75)).toBe("1:15");
});

test("formatDuration zero-pads to MM:SS", () => {
  expect(formatDuration(0)).toBe("00:00");
  expect(formatDuration(9.4)).toBe("00:09");
  expect(formatDuration(75)).toBe("01:15");
  expect(formatDuration(3599)).toBe("59:59");
});
