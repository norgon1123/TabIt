import { PRACTICE_ACCESS, canPractice, practiceLock } from "./gate";
import type { UserOut } from "../api/types";

const ALICE: UserOut = { id: "u1", username: "alice" };

// What we ship today: a guest can practise, and the mode chooser offers it with no caveat.
test("practice mode is open to everyone, guests included", () => {
  expect(PRACTICE_ACCESS).toBe("everyone");
  expect(canPractice(null)).toBe(true);
  expect(practiceLock(null)).toBeNull();
});

// The lock we can throw later, exercised now so flipping the constant is a one-line change
// with a passing test behind it rather than an unknown.
test("under a members-only policy, a guest is locked out and told why", () => {
  expect(canPractice(null, "members")).toBe(false);
  expect(practiceLock(null, "members")).toMatch(/account/i);
});

test("under a members-only policy, a signed-in user still practises", () => {
  expect(canPractice(ALICE, "members")).toBe(true);
  expect(practiceLock(ALICE, "members")).toBeNull();
});
