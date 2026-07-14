import type { UserOut } from "../api/types";

/** Who is allowed to open a song in practice mode.
 *
 * This module is the *only* place that answers that question. Practice mode is free for
 * everyone today, guests included. If it later becomes an account-only or paid feature,
 * change `PRACTICE_ACCESS` here — nothing else moves, because no caller decides for itself:
 * the mode chooser asks `practiceLock()` what to say, and every route into a mode — a URL, a
 * click on the chooser, the header toggle — goes through `allowedMode()`.
 *
 * That last part is the difference between a lock and a hint. A disabled button is a hint;
 * `allowedMode` is the lock, because a locked-out visitor who deletes the `disabled`
 * attribute, hand-types `?mode=practice`, or follows a stale link still lands on the chooser.
 *
 * To add a paid tier: give `UserOut` the flag the API returns (say `is_pro`), add `"pro"` to
 * `PracticeAccess`, and extend the one `switch` below. The call sites already pass the user.
 */
export type PracticeAccess = "everyone" | "members";

/** The two ways to open a song. */
export type ChartMode = "edit" | "practice";

export const PRACTICE_ACCESS: PracticeAccess = "everyone";

/** `access` is injectable so tests can exercise a policy the app is not currently shipping. */
export function canPractice(
  user: UserOut | null,
  access: PracticeAccess = PRACTICE_ACCESS,
): boolean {
  switch (access) {
    case "everyone":
      return true;
    case "members":
      return user != null;
  }
}

/** The mode this visitor actually gets, given the one they asked for.
 *
 * `null` means "unanswered" — show the chooser. A practice request from someone the gate does
 * not admit comes back as `null` rather than being honoured, so there is no route into the
 * mode that skips the policy.
 */
export function allowedMode(
  mode: ChartMode | null,
  user: UserOut | null,
  access: PracticeAccess = PRACTICE_ACCESS,
): ChartMode | null {
  if (mode === "practice" && !canPractice(user, access)) return null;
  return mode;
}

/** Why practice mode is closed to this visitor — `null` when it is open to them. */
export function practiceLock(
  user: UserOut | null,
  access: PracticeAccess = PRACTICE_ACCESS,
): string | null {
  return canPractice(user, access)
    ? null
    : "Practice mode comes with an account — create one and your chord sheets are saved too.";
}
