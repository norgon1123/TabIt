import type { ReactNode } from "react";
import Stack from "../ui/Stack";
import { usePlayback } from "./PlaybackContext";

/** Zone 1: what song this is, how to get back, and how to switch mode.
 *
 *  It RECEDES while the song plays. In play-along your eyes are on your hands, and chrome
 *  you are not using is chrome in the way. That is the same instinct as the rule that the
 *  app stays quiet for a screen reader during playback — and when an accessibility
 *  constraint and a feel constraint want the same thing, it is a real principle rather
 *  than a bolt-on.
 *
 *  It recedes; it does not vanish. A control you cannot find is worse than one you can
 *  ignore. It stays in the DOM, focusable, and one Tab away — the CSS only dims it. */
export default function ChartContextBar({
  title,
  back,
  actions,
}: {
  title: string;
  back?: ReactNode;
  actions?: ReactNode;
}) {
  const { playing } = usePlayback();

  return (
    <div className="chart-context-bar" data-receded={playing ? "true" : undefined}>
      {back}
      <Stack gap={3} wrap>
        <h1 className="chart-context-bar__title">{title}</h1>
        {actions}
      </Stack>
    </div>
  );
}
