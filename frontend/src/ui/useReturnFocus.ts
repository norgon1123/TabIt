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

    // Capture the node now. Reading ref.current inside the cleanup is unreliable — React
    // may have detached it by then.
    const panel = ref.current;
    opener.current = document.activeElement as HTMLElement | null;
    panel?.focus();

    return () => {
      const returning = opener.current;
      opener.current = null;
      if (!returning || !document.body.contains(returning)) return;

      // Only give focus back if the user has NOT moved on. If focus is still inside the
      // panel we are closing (the normal case — they pressed Escape or the close button),
      // or nowhere in particular, return it. If they have Tabbed somewhere else, leave
      // them there.
      //
      // This is not hypothetical: ChordGuess closes itself on a timer after a correct
      // answer. Without this check, a keyboard user who Tabs away during the reveal gets
      // dragged back to the chord cell they had already left.
      const now = document.activeElement;
      const stillInPanel = panel != null && now != null && panel.contains(now);
      const nowhere = now == null || now === document.body;
      if (stillInPanel || nowhere) returning.focus();
    };
  }, [active]);

  return ref;
}
