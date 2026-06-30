import { formatUploadedAt } from "./formatDate";

test("formats a local timestamp as MM/DD/YY HH:mm:ss", () => {
  // Construct via local-time components so the assertion is timezone-independent.
  const d = new Date(2026, 5, 9, 7, 4, 3); // 2026-06-09 07:04:03 local
  expect(formatUploadedAt(d.toISOString())).toBe("06/09/26 07:04:03");
});

test("returns empty string for an invalid date", () => {
  expect(formatUploadedAt("not-a-date")).toBe("");
});
