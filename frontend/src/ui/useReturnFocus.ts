import { useEffect, useRef, type RefObject } from "react";

/** Move focus into a panel when it opens; give it back when it closes.
 *
 *  Without the first half, a keyboard user presses Enter on a chord, the editor appears,
 *  and their focus is still sitting on the chord — the panel may as well not exist.
 *
 *  Without the second half, closing the panel dumps them at the top of the document and
 *  they have to Tab all the way back to the chord they were working on. */
export default function useReturnFocus<T extends HTMLElement = HTMLElement>(
  active: boolean,
): RefObject<T> {
  const ref = useRef<T>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    opener.current = document.activeElement as HTMLElement | null;
    ref.current?.focus();

    return () => {
      // Only give focus back if it is still inside the panel we are closing. If the user
      // has already Tabbed somewhere else, yanking them back would be the rude version of
      // being helpful.
      const returning = opener.current;
      opener.current = null;
      if (returning && document.body.contains(returning)) returning.focus();
    };
  }, [active]);

  return ref;
}
