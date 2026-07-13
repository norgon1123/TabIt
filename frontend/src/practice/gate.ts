import type { UserOut } from "../api/types";

/** Who is allowed to open a song in practice mode.
 *
 * This module is the *only* place that answers that question. Practice mode is free for
 * everyone today, guests included. If it later becomes an account-only or paid feature,
 * change `PRACTICE_ACCESS` here — nothing else moves, because no caller decides for itself:
 * the mode chooser asks `practiceLock()` what to say, and the pages ask `canPractice()`
 * whether the mode is theirs to open.
 *
 * To add a paid tier: give `UserOut` the flag the API returns (say `is_pro`), add `"pro"` to
 * `PracticeAccess`, and extend the one `switch` below. The call sites already pass the user.
 */
export type PracticeAccess = "everyone" | "members";

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

/** Why practice mode is closed to this visitor — `null` when it is open to them. */
export function practiceLock(
  user: UserOut | null,
  access: PracticeAccess = PRACTICE_ACCESS,
): string | null {
  return canPractice(user, access)
    ? null
    : "Practice mode comes with an account — create one and your chord sheets are saved too.";
}
