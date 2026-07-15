# Visual Redesign — Phase 2: The Chart Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the chart page a real structure — a context bar that recedes during playback, the chart as a full-width hero, and a control deck pinned to the bottom — and make the whole thing usable by ear and by keyboard.

**Architecture:** Playback state moves out of `ChartSheet` into a `PlaybackProvider` context, because two sibling zones need it: the control deck *drives* it, and the context bar *recedes* from it. The native `<audio controls>` is replaced by our own deck so the scrubber can announce **musical** positions ("bar 12, beat 2") rather than seconds, which mean nothing to someone practising. The absolutely-positioned, DOM-measured editing panel is replaced by a docked side panel.

**Tech Stack:** React 18 + TypeScript + Vite. Vitest (jsdom) + Testing Library + MSW. Plain CSS with the custom-property token layer built in Phase 1.

**Spec:** `docs/superpowers/specs/2026-07-13-visual-redesign-design.md`
**Phase 1 (foundation):** complete — tokens, two themes, Figtree, `Stack`/`Button`/`Card`/`Field`/`Panel`. 383 tests green.

## Global Constraints

- **Quiet while playing, rich while paused — precisely: during playback the app never VOLUNTEERS speech, it may ANSWER when spoken to.** During playback the user is **listening**. Screen-reader speech and the music compete for the same channel — a chart that announced every chord change unprompted would be *actively hostile*. But a message that directly answers something the user just did is not competing for that channel; it is the thing they asked for. **"No live regions may fire while `playing` is true" is a crude, WRONG restatement of this rule** — taken literally it would silence `ChordGuess`'s guess feedback, leaving a blind user with no idea whether a mid-song guess was right. This is also why the chrome recedes: the same principle, expressed visually.

  | Speaker | Volunteers or answers? | Verdict |
  |---|---|---|
  | Practice status line (*"3 of 8 chords named"*) | volunteers | gated on `!playing` |
  | `Spinner` / `AnalyzingIndicator` (*"Analyzing…"*) | volunteers | gated on `!playing` |
  | `WhereAmI` (*"bar 12, beat 2"*) | answers — the user pressed a button | speaks, `role="status"` (polite) |
  | `ChordGuess` (*"Not that one" / "C major — that's it"*) | answers — the user submitted a guess | speaks, **never** gated on `!playing`; `role="status"` (polite), not `role="alert"` — a wrong guess is not an emergency |

  Practice mode is an ear-training quiz — the single most valuable feature this app has
  for a blind or low-vision musician — so `ChordGuess`'s verdict must always speak. It is
  never `role="alert"` because nothing in it is urgent enough to interrupt the music; it
  is always `role="status"` because the user asked and can wait a beat for the answer.
  Contrast `Field`'s form-validation error, which stays `role="alert"`: a failed save is a
  genuine, rare, user-initiated error the user must not miss.
- **The scrubber speaks music, not seconds.** `aria-valuetext` must read *"bar 12, beat 2"*. `87 seconds` is meaningless to someone practising, and it is the reason we cannot keep the native `<audio controls>`.
- **Inline `style={{...}}` is permitted for runtime-computed geometry ONLY** — a beat-derived flex ratio, a playhead transform, a scrub position. **Forbidden** for colour, spacing, radius, border, shadow, font, or static layout. `src/ui/noInlineStyle.test.ts` enforces this and will fail the build.
- **Tokens are the only source of visual values.** `src/theme/palette.test.ts` parses `index.css` and fails the build on any hardcoded hex outside the token blocks, and on any colour pair below WCAG AA.
- **`--line`** = decorative hairline (~1.85:1, ungoverned). **`--control-border`** = an interactive control's boundary (3:1, WCAG-governed). **`--bar-line`** = the measure rule (3:1, and heavier than `--line` by **both** colour and width — 3px vs 1px). Not interchangeable. **Do not "tidy" the 3:1 width ratio; it is the channel that survives colourblindness.**
- **Hue is never the only channel.**
- **`prefers-reduced-motion` must not regress.**
- **Do not touch `chart/chordProgress.ts`.** Its GPU-transition scheme (transform/opacity only, no layout thrash) is protected by `chordProgress.test.ts` and by the transform/transition assertions in `Timeline.test.tsx`. **Phase 3 builds on it.**
- **Drag-to-resize gets ZERO investment** — it may be cut from the app. Keep the handles working; give them no polish, no new tests, no keyboard support. The **Beats** field in `SegmentEditor` (`step="0.5"`, `min="0.5"`) is the mouse-free path to the same behaviour, and `ChartEditorPage.edit.test.tsx`'s keyboard test proves it. **That test is what makes the cut safe — never delete it.**
- **No new product features.** No streaks, no scores, no playback-speed control. This is structure and accessibility.
- **Definition of done, per `CLAUDE.md`:** `cd frontend && npm test` and `cd frontend && npm run build` both green. Every task ends green and committed.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `frontend/src/chart/musicalPosition.ts` | Pure. Seconds → `{ bar, beat }` on the chart's beat grid, and the human string. No React. |
| `frontend/src/chart/musicalPosition.test.ts` | |
| `frontend/src/chart/PlaybackContext.tsx` | Owns `useMediaClock()`. The one place playback state lives, because the deck drives it and the context bar recedes from it. |
| `frontend/src/chart/PlaybackContext.test.tsx` | |
| `frontend/src/chart/ControlDeck.tsx` | The pinned bottom deck: play/pause, the scrubber, elapsed/total, tempo and key. |
| `frontend/src/chart/ControlDeck.test.tsx` | |
| `frontend/src/chart/ChartContextBar.tsx` | Zone 1: title, back link, mode switch. Recedes while playing. |
| `frontend/src/chart/ChartContextBar.test.tsx` | |
| `frontend/src/chart/WhereAmI.tsx` | The on-demand "where am I" — replaces the live region we are *not* allowed to have during playback. |
| `frontend/src/chart/WhereAmI.test.tsx` | |
| `frontend/src/ui/useReturnFocus.ts` | Move focus into a panel on open; return it to the opener on close. |
| `frontend/src/ui/useReturnFocus.test.tsx` | |

**Modify:**

| File | Change |
|---|---|
| `frontend/src/chart/useMediaClock.ts` | Add `play()`, `pause()`, `toggle()`. It currently only exposes `seek`. |
| `frontend/src/chart/ScrubBar.tsx` | Revive it. Add `aria-valuetext` (musical). Keep the transform scheme — its tests protect it. |
| `frontend/src/chart/ChartSheet.tsx` | Drop the native `<audio controls>`, the `editorTop` state and the DOM-measuring `useLayoutEffect` (:78-89). Consume `PlaybackContext`. Render the three zones. |
| `frontend/src/chart/Timeline.tsx` | The chart becomes a **semantic sequence**: a named list, cells announcing *"bar 3, beat 1, A minor, 2 beats"*. |
| `frontend/src/ui/Panel.tsx` | **Remove the `top` prop.** The docked panel makes it dead. Add focus management. |
| `frontend/src/chart/SegmentEditor.tsx`, `frontend/src/practice/ChordGuess.tsx` | Stop passing `top`. |
| `frontend/src/pages/ChartEditorPage.tsx`, `frontend/src/pages/GuestHomePage.tsx` | Wrap in `PlaybackProvider`; hand the title/actions to the context bar. |
| `frontend/src/index.css` | The three-zone layout, the docked panel, the deck. Delete `.chart-panel`'s absolute positioning and the 1320px breakpoint. |
| `frontend/src/ui/noInlineStyle.test.ts` | **Remove `src/ui/Panel.tsx` and `src/chart/ChartSheet.tsx` from `ALLOWED`** — they stop having any inline style. |

**Do NOT touch:** `chordProgress.ts`, `beatMath.ts`, `beatGrid.ts`, `chartLayout.ts`, the drag-resize handles, the practice feedback classes (`chord-guess--wrong` / `--right` / `shake` — **Phase 3** owns the one-channel "correct" bug).

---

## Tests this phase deliberately breaks

Four assertions die, and **three of them dying is the point** — they pin mechanisms this phase exists to replace. Each task below names the ones it kills.

| Test | Asserts | Killed by |
|---|---|---|
| `ui/Panel.test.tsx` — "keeps `top` as an inline style" | `style.top === "120px"` | Task 6. The docked panel has no `top`. |
| `ui/Panel.test.tsx` — "does not let a caller clobber the measured `top` offset" | `style.top` survives a caller's `style` | Task 6. Same reason. |
| `pages/ChartEditorPage.edit.test.tsx` — the `editor.style.top` assertion | the panel is absolutely positioned | Task 6. **Good riddance — it tested the mechanism, not the behaviour.** |
| Anything asserting on the native `<audio controls>` | | Task 4. **Grep for it first.** |

**Leave alone:** every transform/transition assertion in `Timeline.test.tsx`, `chordProgress.test.ts`, and `ScrubBar.test.tsx`. They test *animation logic*, not appearance, and Phase 3 builds on the scheme they guard.

---

### Task 1: Musical position — seconds to bar-and-beat

Pure functions, no React. Everything downstream depends on these, and the whole "the scrubber speaks music" requirement rests on them.

**Files:**
- Create: `frontend/src/chart/musicalPosition.ts`
- Test: `frontend/src/chart/musicalPosition.test.ts`

**Interfaces:**
- Produces:
  - `interface MusicalPosition { bar: number; beat: number }` — both **1-based**, as a musician counts.
  - `barBeatAt(grid: BeatGridInfo, timeSeconds: number): MusicalPosition`
  - `formatMusicalPosition(p: MusicalPosition): string` → `"bar 12, beat 2"`
  - `interface BeatGridInfo { beatTimes: number[]; bpm: number | null; duration: number; beatsPerMeasure: number; measureOffset: number }`
- Tasks 2, 3, 5 and 7 consume all of these.

- [ ] **Step 1: Write the failing test**

`frontend/src/chart/musicalPosition.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { barBeatAt, formatMusicalPosition, type BeatGridInfo } from "./musicalPosition";

/** 120 BPM, 4/4: a beat every 0.5s, a bar every 2s. */
const GRID: BeatGridInfo = {
  beatTimes: Array.from({ length: 33 }, (_, i) => i * 0.5), // beats 0..32 => 0s..16s
  bpm: 120,
  duration: 16,
  beatsPerMeasure: 4,
  measureOffset: 0,
};

describe("barBeatAt", () => {
  it("counts from ONE, the way a musician does", () => {
    // Beat index 0 is "bar 1, beat 1". A player who is told "bar 0" will not know what
    // you mean — there is no bar zero on any chart they have ever read.
    expect(barBeatAt(GRID, 0)).toEqual({ bar: 1, beat: 1 });
  });

  it("walks the beats within a bar", () => {
    expect(barBeatAt(GRID, 0.5)).toEqual({ bar: 1, beat: 2 });
    expect(barBeatAt(GRID, 1.0)).toEqual({ bar: 1, beat: 3 });
    expect(barBeatAt(GRID, 1.5)).toEqual({ bar: 1, beat: 4 });
  });

  it("rolls over into the next bar", () => {
    expect(barBeatAt(GRID, 2.0)).toEqual({ bar: 2, beat: 1 });
    expect(barBeatAt(GRID, 4.0)).toEqual({ bar: 3, beat: 1 });
    expect(barBeatAt(GRID, 15.5)).toEqual({ bar: 8, beat: 4 });
  });

  it("holds the beat until the next onset — it does not round up early", () => {
    // Mid-beat is still that beat. Announcing "beat 3" when you are 40% through beat 2
    // would be a lie, and the whole point of this string is that a player can trust it.
    expect(barBeatAt(GRID, 0.7)).toEqual({ bar: 1, beat: 2 });
    expect(barBeatAt(GRID, 0.999)).toEqual({ bar: 1, beat: 2 });
  });

  it("puts anything before the first downbeat in a PICKUP, not in bar 1", () => {
    // A song with a 1-beat pickup: the bar line falls one beat late.
    //
    // This is the case that decides the whole design. If pre-downbeat material is clamped
    // into bar 1, then the pickup announces "bar 1, beat 4" and the very next beat
    // announces "bar 1, beat 1" — beat 4 arriving BEFORE beat 1 inside the same bar. Read
    // aloud that is gibberish, and it would make the readout untrustworthy. Musicians do
    // not number an anacrusis as bar 1; they call it a pickup. So do we.
    const pickup: BeatGridInfo = { ...GRID, measureOffset: 1 };
    expect(barBeatAt(pickup, 0)).toEqual({ bar: 0, beat: 4 });   // the pickup beat
    expect(barBeatAt(pickup, 0.5)).toEqual({ bar: 1, beat: 1 }); // the first downbeat
    expect(barBeatAt(pickup, 2.5)).toEqual({ bar: 2, beat: 1 });
  });

  it("handles times below zero and past the end without returning nonsense", () => {
    expect(barBeatAt(GRID, -5)).toEqual({ bar: 1, beat: 1 });
    const past = barBeatAt(GRID, 999);
    expect(Number.isFinite(past.bar)).toBe(true);
    expect(past.beat).toBeGreaterThanOrEqual(1);
    expect(past.beat).toBeLessThanOrEqual(4);
  });

  it("survives a chart with no beat grid at all", () => {
    // A chart analysed before beat_times existed, or one whose tracker found nothing.
    // It must degrade to the BPM rather than divide by zero or return NaN.
    const noGrid: BeatGridInfo = { ...GRID, beatTimes: [] };
    const p = barBeatAt(noGrid, 2.0);
    expect(Number.isFinite(p.bar)).toBe(true);
    expect(Number.isFinite(p.beat)).toBe(true);
    expect(p).toEqual({ bar: 2, beat: 1 });
  });

  it("survives a 1-beat measure without dividing by zero", () => {
    const odd: BeatGridInfo = { ...GRID, beatsPerMeasure: 0 };
    const p = barBeatAt(odd, 1.0);
    expect(Number.isFinite(p.bar)).toBe(true);
    expect(Number.isFinite(p.beat)).toBe(true);
  });
});

describe("formatMusicalPosition", () => {
  it("reads the way a bandleader counts you in", () => {
    // This string is spoken aloud by a screen reader. "bar 12, beat 2" is what a player
    // says. "87 seconds" is not, and is the reason we cannot keep the native audio
    // element's own slider.
    expect(formatMusicalPosition({ bar: 12, beat: 2 })).toBe("bar 12, beat 2");
    expect(formatMusicalPosition({ bar: 1, beat: 1 })).toBe("bar 1, beat 1");
  });

  it("calls a pickup a pickup", () => {
    expect(formatMusicalPosition({ bar: 0, beat: 4 })).toBe("pickup, beat 4");
    expect(formatMusicalPosition({ bar: -1, beat: 2 })).toBe("pickup, beat 2");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd frontend && npx vitest run src/chart/musicalPosition.test.ts
```

Expected: FAIL — `Failed to resolve import "./musicalPosition"`.

- [ ] **Step 3: Implement**

`frontend/src/chart/musicalPosition.ts`:

```ts
/** Where you are in the song, in the units a player actually counts.
 *
 *  A scrubber that announces "87 seconds" tells a musician nothing. "Bar 12, beat 2" tells
 *  them exactly where to put their hands. This module is the translation, and it is the
 *  reason Phase 2 replaces the native <audio> element's slider — that slider only knows
 *  seconds and cannot be taught otherwise. */

const DEFAULT_BPM = 120;

export interface BeatGridInfo {
  /** Ascending beat-onset seconds, as the analysis produced them. May be empty. */
  beatTimes: number[];
  bpm: number | null;
  duration: number;
  beatsPerMeasure: number;
  /** Which beat the first bar line falls on — a pickup shifts it. */
  measureOffset: number;
}

/** `beat` is 1-based, always. `bar` is 1-based for the song proper, and **0 or below for a
 *  pickup** — material before the first downbeat, which musicians do not number as bar 1. */
export interface MusicalPosition {
  bar: number;
  beat: number;
}

/** The beat index (0-based, may be fractional) at a given time.
 *  Falls back to a straight BPM division when the tracker found no onsets. */
function beatIndexAt(grid: BeatGridInfo, timeSeconds: number): number {
  const t = Math.max(0, timeSeconds);
  const times = [...grid.beatTimes].sort((a, b) => a - b);

  if (times.length < 2) {
    const tempo = grid.bpm && grid.bpm > 0 ? grid.bpm : DEFAULT_BPM;
    return t / (60 / tempo);
  }

  if (t <= times[0]) return 0;
  const last = times.length - 1;
  if (t >= times[last]) {
    const step = times[last] - times[last - 1];
    return step > 0 ? last + (t - times[last]) / step : last;
  }

  let i = 0;
  while (i < last && times[i + 1] <= t) i += 1;
  const step = times[i + 1] - times[i];
  return step > 0 ? i + (t - times[i]) / step : i;
}

export function barBeatAt(grid: BeatGridInfo, timeSeconds: number): MusicalPosition {
  const perMeasure = Math.max(1, Math.floor(grid.beatsPerMeasure) || 1);

  // Floor, never round: mid-beat is still that beat. Announcing the next one while the
  // player is only 40% into this one would make the readout untrustworthy, and the only
  // thing this string has going for it is that a player can trust it.
  const absolute = Math.floor(beatIndexAt(grid, timeSeconds));

  // measureOffset says which beat carries the bar line. Shift, then wrap into the bar.
  // The modulo is written the long way because JS's % keeps the sign of the dividend:
  // -1 % 4 is -1, not 3, and a pickup makes `shifted` negative.
  const shifted = absolute - grid.measureOffset;
  const beatInBar = ((shifted % perMeasure) + perMeasure) % perMeasure;

  // Deliberately NOT clamped to 1. Anything before the first downbeat gets bar <= 0, and
  // formatMusicalPosition calls it a pickup.
  //
  // Clamping was the first thing I wrote and it is wrong: with a one-beat pickup it makes
  // the anacrusis announce "bar 1, beat 4" and the very next beat announce "bar 1, beat 1"
  // — beat 4 arriving BEFORE beat 1 inside the same bar. Read aloud that is gibberish, and
  // a readout a player cannot trust is worse than no readout.
  return {
    bar: Math.floor(shifted / perMeasure) + 1,
    beat: beatInBar + 1,
  };
}

export function formatMusicalPosition(p: MusicalPosition): string {
  // A pickup is not bar 1 and no musician calls it that. Naming it is both more honest and
  // more useful: "pickup, beat 4" tells a player exactly what they are hearing.
  if (p.bar < 1) return `pickup, beat ${p.beat}`;
  return `bar ${p.bar}, beat ${p.beat}`;
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd frontend && npx vitest run src/chart/musicalPosition.test.ts
```

Expected: PASS, 10 tests.

**These expectations have been checked against a running implementation, not reasoned about.** If one fails, work the arithmetic by hand before you touch either side — the pickup case in particular is deliberate, and the temptation to "fix" it by clamping `bar` to a minimum of 1 is exactly the bug the comment in the source warns about.

- [ ] **Step 5: Full suite and commit**

```bash
cd frontend && npm test && npm run build
```

```bash
git add frontend/src/chart/musicalPosition.ts frontend/src/chart/musicalPosition.test.ts
git commit -m "feat(chart): translate seconds into bars and beats

A scrubber that announces '87 seconds' tells a musician nothing; 'bar 12,
beat 2' tells them where to put their hands. This is the translation, and
it is why Phase 2 has to replace the native <audio> slider — that slider
only knows seconds and cannot be taught otherwise.

Counts from one, floors rather than rounds (mid-beat is still that beat),
honours measureOffset for pickups, and degrades to plain BPM division when
the beat tracker found no onsets."
```

---

### Task 2: `useMediaClock` learns to play and pause

The deck needs a play button. The clock currently only exposes `seek`.

**Files:**
- Modify: `frontend/src/chart/useMediaClock.ts`
- Test: `frontend/src/chart/useMediaClock.test.tsx` (exists — extend it)

**Interfaces:**
- Consumes: nothing new.
- Produces: `MediaClock` gains `play(): void`, `pause(): void`, `toggle(): void`. Existing members (`currentTime`, `duration`, `playing`, `rate`, `seek`, `ref`) are unchanged. Tasks 3 and 4 consume `toggle`.

- [ ] **Step 1: Read the file first**

```bash
cd frontend && cat src/chart/useMediaClock.ts && cat src/chart/useMediaClock.test.tsx
```

It exposes `{ currentTime, duration, playing, rate, seek, ref }` and attaches listeners to the `<audio>` element behind `ref`. Follow its existing patterns exactly.

- [ ] **Step 2: Write the failing test**

Append to `frontend/src/chart/useMediaClock.test.tsx`, following the file's existing render/harness pattern (read it first — do not invent a new harness):

```tsx
it("plays, pauses, and toggles the element behind the ref", async () => {
  const { clock, audio } = renderClock(); // reuse the file's existing helper

  // jsdom's HTMLMediaElement does not implement play/pause; stub them.
  const play = vi.spyOn(audio, "play").mockResolvedValue(undefined);
  const pause = vi.spyOn(audio, "pause").mockImplementation(() => {});

  act(() => clock.current.play());
  expect(play).toHaveBeenCalledOnce();

  act(() => clock.current.pause());
  expect(pause).toHaveBeenCalledOnce();
});

it("toggle plays when paused and pauses when playing", async () => {
  const { clock, audio } = renderClock();
  const play = vi.spyOn(audio, "play").mockResolvedValue(undefined);
  const pause = vi.spyOn(audio, "pause").mockImplementation(() => {});

  // jsdom reports `paused` from its own property; drive it explicitly.
  Object.defineProperty(audio, "paused", { value: true, configurable: true });
  act(() => clock.current.toggle());
  expect(play).toHaveBeenCalledOnce();

  Object.defineProperty(audio, "paused", { value: false, configurable: true });
  act(() => clock.current.toggle());
  expect(pause).toHaveBeenCalledOnce();
});

it("does not throw when there is no element yet", () => {
  // The deck can render a frame before the <audio> mounts. A play button that throws
  // on the first paint is worse than one that does nothing.
  const { clock } = renderClockWithoutAudio(); // if the file has no such helper, render
                                               // the hook with the ref left unattached
  expect(() => clock.current.toggle()).not.toThrow();
});
```

**Adapt the helper names to whatever `useMediaClock.test.tsx` already uses.** If it has no "no element" harness, construct one by rendering the hook and never attaching `ref`.

- [ ] **Step 3: Run and watch fail**

```bash
cd frontend && npx vitest run src/chart/useMediaClock.test.tsx
```

Expected: FAIL — `clock.current.play is not a function`.

- [ ] **Step 4: Implement**

In `frontend/src/chart/useMediaClock.ts`, add to the `MediaClock` interface and to the returned object:

```ts
  /** The deck can paint before the <audio> mounts, so every one of these is a no-op
   *  against a null ref rather than a throw. A play button that explodes on first paint
   *  is worse than one that does nothing for a frame. */
  const play = useCallback(() => {
    // A rejected play() (autoplay policy, no user gesture) is not an error we can act on
    // — the element stays paused and `playing` stays false, which is already the truth.
    void ref.current?.play()?.catch(() => {});
  }, []);

  const pause = useCallback(() => {
    ref.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play()?.catch(() => {});
    else el.pause();
  }, []);
```

and return `{ currentTime, duration, playing, rate, seek, play, pause, toggle, ref }`.

Import `useCallback` from React if it is not already imported.

- [ ] **Step 5: Run, full suite, commit**

```bash
cd frontend && npx vitest run src/chart/useMediaClock.test.tsx && npm test && npm run build
```

```bash
git add frontend/src/chart/useMediaClock.ts frontend/src/chart/useMediaClock.test.tsx
git commit -m "feat(chart): the media clock can play, pause and toggle

The control deck needs a play button, and the clock only knew how to seek.

Every method is a no-op against a null ref rather than a throw — the deck
can paint a frame before the <audio> mounts, and a play button that explodes
on first paint is worse than one that does nothing. A rejected play() (no
user gesture yet) is swallowed: the element stays paused and `playing` stays
false, which is already the truth."
```

---

### Task 3: `PlaybackContext` — one home for playback state

Two sibling zones need it: the deck **drives** playback, the context bar **recedes** from it. Threading a clock through both would mean lifting it into every page; a context is the honest decomposition.

**Files:**
- Create: `frontend/src/chart/PlaybackContext.tsx`, `frontend/src/chart/PlaybackContext.test.tsx`

**Interfaces:**
- Consumes: `useMediaClock()` and its `MediaClock` type (Task 2).
- Produces:
  - `PlaybackProvider({ children }: { children: ReactNode }): JSX.Element`
  - `usePlayback(): MediaClock` — throws outside a provider.
- Tasks 4, 5, 7 and 8 consume `usePlayback`.

- [ ] **Step 1: Write the failing test**

`frontend/src/chart/PlaybackContext.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlaybackProvider, usePlayback } from "./PlaybackContext";

function Probe() {
  const clock = usePlayback();
  return (
    <>
      <span data-testid="playing">{String(clock.playing)}</span>
      <audio ref={clock.ref} data-testid="audio" />
    </>
  );
}

describe("PlaybackProvider", () => {
  it("hands the same clock to every consumer", () => {
    render(
      <PlaybackProvider>
        <Probe />
      </PlaybackProvider>,
    );
    expect(screen.getByTestId("playing")).toHaveTextContent("false");
  });

  it("exposes the ref, so the <audio> element can be attached by a child", () => {
    render(
      <PlaybackProvider>
        <Probe />
      </PlaybackProvider>,
    );
    expect(screen.getByTestId("audio")).toBeInTheDocument();
  });

  it("throws outside a provider rather than silently handing back a dead clock", () => {
    // A dead clock would look like "the song is paused, forever" — a bug that presents as
    // a UI that simply does not work, with nothing in the console. Fail loudly instead.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/usePlayback must be used inside a PlaybackProvider/);
    quiet.mockRestore();
  });
});
```

Add `import { vi } from "vitest";` to the import line.

- [ ] **Step 2: Run and watch fail**

```bash
cd frontend && npx vitest run src/chart/PlaybackContext.test.tsx
```

Expected: FAIL — `Failed to resolve import "./PlaybackContext"`.

- [ ] **Step 3: Implement**

`frontend/src/chart/PlaybackContext.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from "react";
import { useMediaClock, type MediaClock } from "./useMediaClock";

/** The one place playback state lives.
 *
 *  Two sibling zones need it and neither owns the other: the control deck DRIVES playback,
 *  and the context bar RECEDES from it (chrome you are not using, while your eyes are on
 *  your hands, is chrome in the way). Threading a clock through both would mean lifting it
 *  into every page that renders a chart. A context is the honest shape. */
const PlaybackContext = createContext<MediaClock | null>(null);

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const clock = useMediaClock();
  return <PlaybackContext.Provider value={clock}>{children}</PlaybackContext.Provider>;
}

export function usePlayback(): MediaClock {
  const clock = useContext(PlaybackContext);
  if (!clock) throw new Error("usePlayback must be used inside a PlaybackProvider");
  return clock;
}
```

- [ ] **Step 4: Run, full suite, commit**

```bash
cd frontend && npx vitest run src/chart/PlaybackContext.test.tsx && npm test && npm run build
```

```bash
git add frontend/src/chart/PlaybackContext.tsx frontend/src/chart/PlaybackContext.test.tsx
git commit -m "feat(chart): one home for playback state

Two sibling zones need it and neither owns the other: the control deck drives
playback, and the context bar recedes from it. Threading a clock through both
would mean lifting it into every page that renders a chart.

usePlayback throws outside a provider rather than handing back a dead clock —
a dead clock presents as 'the song is paused, forever', a UI that simply does
not work with nothing in the console."
```

---

### Task 4: The scrubber speaks music

Revive `ScrubBar` and give it a musical `aria-valuetext`. **This is the reason the native `<audio controls>` has to go** — it only knows seconds.

**Files:**
- Modify: `frontend/src/chart/ScrubBar.tsx`
- Test: `frontend/src/chart/ScrubBar.test.tsx` (exists — extend, do not rewrite)

**Interfaces:**
- Consumes: `barBeatAt`, `formatMusicalPosition`, `BeatGridInfo` (Task 1).
- Produces: `ScrubBarProps` gains `grid: BeatGridInfo`. Existing props (`currentTime`, `duration`, `playing`, `rate`, `onSeek`) unchanged. Task 5 renders it.

**Read `ScrubBar.tsx` first.** It is 111 lines, currently dead code (commented out of `ChartSheet`), already `role="slider"` with `tabIndex={0}` and Arrow-key seeking, and it already carries two runtime-geometry inline styles (the fill's `scaleX` and the knob's `left`). **Those stay.** Its existing transform/transition assertions in `ScrubBar.test.tsx` protect the compositor scheme — **do not break them.**

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/chart/ScrubBar.test.tsx` (reuse its existing render helper — read the file first):

```tsx
import { type BeatGridInfo } from "./musicalPosition";

/** 120 BPM, 4/4 — a beat every 0.5s, a bar every 2s. */
const GRID: BeatGridInfo = {
  beatTimes: Array.from({ length: 33 }, (_, i) => i * 0.5),
  bpm: 120,
  duration: 16,
  beatsPerMeasure: 4,
  measureOffset: 0,
};

describe("the scrubber speaks music, not seconds", () => {
  it("announces its position as a bar and a beat", () => {
    // THE point of replacing the native <audio> slider. "87 seconds" tells a musician
    // nothing; "bar 12, beat 2" tells them where to put their hands.
    render(<ScrubBar currentTime={4.0} duration={16} playing={false} rate={1} grid={GRID} onSeek={() => {}} />);
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-valuetext", "bar 3, beat 1");
  });

  it("updates the announcement as it moves", () => {
    const { rerender } = render(
      <ScrubBar currentTime={0} duration={16} playing={false} rate={1} grid={GRID} onSeek={() => {}} />,
    );
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "bar 1, beat 1");

    rerender(<ScrubBar currentTime={2.5} duration={16} playing={false} rate={1} grid={GRID} onSeek={() => {}} />);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "bar 2, beat 2");
  });

  it("is not a live region — it must not announce while the song plays", () => {
    // During playback the user is LISTENING. Screen-reader speech and the music compete
    // for the same channel; a slider that narrated every beat would be actively hostile.
    // aria-valuetext is read when the user MOVES the slider, which is the whole point:
    // it speaks when spoken to.
    render(<ScrubBar currentTime={4} duration={16} playing rate={1} grid={GRID} onSeek={() => {}} />);
    const slider = screen.getByRole("slider");
    expect(slider).not.toHaveAttribute("aria-live");
    expect(slider.closest("[aria-live]")).toBeNull();
    expect(slider).not.toHaveAttribute("role", "status");
  });

  it("keeps its numeric value too, for assistive tech that wants a ratio", () => {
    render(<ScrubBar currentTime={4} duration={16} playing={false} rate={1} grid={GRID} onSeek={() => {}} />);
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-valuenow", "4");
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "16");
  });
});
```

You will need to pass the new `grid` prop to **every existing** `ScrubBar` render in that file. Use `GRID`.

- [ ] **Step 2: Run and watch fail**

```bash
cd frontend && npx vitest run src/chart/ScrubBar.test.tsx
```

Expected: FAIL — no `aria-valuetext`, and TS errors on the unknown `grid` prop.

- [ ] **Step 3: Implement**

In `frontend/src/chart/ScrubBar.tsx`, add to the props interface and the slider element:

```ts
import { barBeatAt, formatMusicalPosition, type BeatGridInfo } from "./musicalPosition";

interface ScrubBarProps {
  currentTime: number;
  duration: number;
  playing: boolean;
  rate: number;
  /** The chart's beat grid, so the slider can announce where it is in MUSIC. */
  grid: BeatGridInfo;
  onSeek: (time: number) => void;
}
```

and on the `role="slider"` div, alongside the existing `aria-valuenow`:

```tsx
      // Seconds are meaningless to someone practising. A screen reader reads valuetext in
      // preference to valuenow, so this is what a player actually hears when they move the
      // scrubber — and it is why the native <audio> element's own slider had to go.
      //
      // Deliberately NOT a live region: during playback the user is LISTENING, and speech
      // competes with the music. This speaks when spoken to.
      aria-valuetext={formatMusicalPosition(barBeatAt(grid, currentTime))}
```

Everything else in the file — the pointer handlers, the arrow-key seeking, the compositor `useEffect`, both inline styles — stays exactly as it is.

- [ ] **Step 4: Run, full suite, commit**

```bash
cd frontend && npx vitest run src/chart/ScrubBar.test.tsx && npm test && npm run build
```

Expected: PASS, including every pre-existing transform/transition assertion.

```bash
git add frontend/src/chart/ScrubBar.tsx frontend/src/chart/ScrubBar.test.tsx
git commit -m "feat(chart): the scrubber announces bars and beats, not seconds

This is the reason the native <audio controls> has to go: its slider only
knows seconds, and '87 seconds' tells a musician nothing. 'Bar 12, beat 2'
tells them where to put their hands.

Deliberately NOT a live region. During playback the user is listening, and
screen-reader speech competes with the music for the same channel. The
slider speaks when spoken to — aria-valuetext is read when the user moves
it, which is exactly when they want to know."
```

---

### Task 5: The control deck

Zone 3. One place, always the same place — and the bottom edge is the thumb zone, which is the cheapest thing we can do today to prepare for the phone that is on the roadmap.

**Files:**
- Create: `frontend/src/chart/ControlDeck.tsx`, `frontend/src/chart/ControlDeck.test.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `usePlayback()` (Task 3), `ScrubBar` + its `grid` prop (Task 4), `BeatGridInfo` (Task 1), `Stack`/`Button` (Phase 1), `formatTime` from `./timeMath`.
- Produces: `ControlDeck({ grid, children }: { grid: BeatGridInfo; children?: ReactNode }): JSX.Element`. `children` is the tempo/key cluster the sheet passes in, so the deck does not need to know about charts. Task 7 renders it.

- [ ] **Step 1: Write the failing test**

`frontend/src/chart/ControlDeck.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ControlDeck from "./ControlDeck";
import { PlaybackProvider } from "./PlaybackContext";
import type { BeatGridInfo } from "./musicalPosition";

const GRID: BeatGridInfo = {
  beatTimes: Array.from({ length: 33 }, (_, i) => i * 0.5),
  bpm: 120,
  duration: 16,
  beatsPerMeasure: 4,
  measureOffset: 0,
};

function renderDeck(extra?: React.ReactNode) {
  return render(
    <PlaybackProvider>
      <ControlDeck grid={GRID}>{extra}</ControlDeck>
    </PlaybackProvider>,
  );
}

describe("ControlDeck", () => {
  it("offers a real play button whose name says what pressing it DOES", () => {
    // "Playing" as a label is ambiguous read aloud — is it reporting a state or offering
    // an action? The name must say what happens when you press it.
    renderDeck();
    expect(screen.getByRole("button", { name: /^play$/i })).toBeInTheDocument();
  });

  it("carries the scrubber", () => {
    renderDeck();
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("puts whatever the sheet hands it into the deck", () => {
    // The deck does not know what a chart is. Tempo and key are passed in.
    renderDeck(<span>92 BPM</span>);
    expect(screen.getByText("92 BPM")).toBeInTheDocument();
  });

  it("is a landmark, so a screen-reader user can jump straight to the transport", () => {
    renderDeck();
    expect(screen.getByRole("region", { name: /playback/i })).toBeInTheDocument();
  });

  it("has no live region — the deck must stay silent while the song plays", () => {
    // The user is LISTENING. Anything that narrates during playback competes with the
    // music. This is the single rule the whole phase turns on.
    const { container } = renderDeck();
    expect(container.querySelector("[aria-live]")).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("toggles playback when the play button is pressed", async () => {
    // jsdom does not implement play(); spy on the prototype so the click has something
    // to hit.
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    render(
      <PlaybackProvider>
        <ControlDeck grid={GRID} />
        <AudioProbe />
      </PlaybackProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /^play$/i }));
    expect(play).toHaveBeenCalledOnce();
    play.mockRestore();
  });
});

/** The deck does not render the <audio> element — the sheet does. Stand one in. */
function AudioProbe() {
  const clock = usePlayback();
  return <audio ref={clock.ref} />;
}
```

Add `import { usePlayback } from "./PlaybackContext";` and `import type React from "react";` as needed.

- [ ] **Step 2: Run and watch fail**

```bash
cd frontend && npx vitest run src/chart/ControlDeck.test.tsx
```

Expected: FAIL — `Failed to resolve import "./ControlDeck"`.

- [ ] **Step 3: Implement**

`frontend/src/chart/ControlDeck.tsx`:

```tsx
import type { ReactNode } from "react";
import { usePlayback } from "./PlaybackContext";
import ScrubBar from "./ScrubBar";
import Stack from "../ui/Stack";
import Button from "../ui/Button";
import { formatTime } from "./timeMath";
import type { BeatGridInfo } from "./musicalPosition";

/** Zone 3: the transport, in one place, always the same place.
 *
 *  Everything you reach for while a song is running lives here — play, the scrubber, the
 *  clock, and (handed in by the sheet) the tempo and key. Before this, they were scattered
 *  between the native <audio> element and the page title row.
 *
 *  It is pinned to the BOTTOM, and that is not an aesthetic call: a phone app is on the
 *  roadmap, the bottom edge is the thumb zone, and putting the transport there today costs
 *  nothing and saves the move later.
 *
 *  It is SILENT. No live regions, no role="status". During playback the user is listening,
 *  and speech competes with the music. The deck speaks only when spoken to — the scrubber's
 *  aria-valuetext, read when you move it. */
export default function ControlDeck({
  grid,
  children,
}: {
  grid: BeatGridInfo;
  children?: ReactNode;
}) {
  const clock = usePlayback();
  const duration = clock.duration || grid.duration;

  return (
    <section className="control-deck" aria-label="Playback">
      <Stack className="control-deck__row" gap={3} align="center">
        <Button
          variant="primary"
          className="control-deck__play"
          onClick={clock.toggle}
          // The name says what pressing it DOES. "Playing" would be ambiguous read aloud:
          // a screen-reader user cannot tell a state report from an offer of an action.
          aria-label={clock.playing ? "Pause" : "Play"}
        >
          <span aria-hidden="true">{clock.playing ? "❚❚" : "▶"}</span>
        </Button>

        <span className="control-deck__time muted">{formatTime(clock.currentTime)}</span>

        <div className="control-deck__scrub">
          <ScrubBar
            currentTime={clock.currentTime}
            duration={duration}
            playing={clock.playing}
            rate={clock.rate}
            grid={grid}
            onSeek={clock.seek}
          />
        </div>

        <span className="control-deck__time muted">{formatTime(duration)}</span>

        {children && <div className="control-deck__extra">{children}</div>}
      </Stack>
    </section>
  );
}
```

- [ ] **Step 4: Add the CSS**

Append to `frontend/src/index.css`. **Tokens only — a test fails the build on any hardcoded hex.**

```css
/* ---- Zone 3: the control deck --------------------------------------------------------
   Pinned to the bottom, because a phone is on the roadmap and the bottom edge is the thumb
   zone. Costs nothing to take now. */
.control-deck {
  position: sticky;
  bottom: 0;
  z-index: 20;
  background: var(--surface);
  border-top: 1px solid var(--line);
  box-shadow: var(--shadow-panel);
  padding: var(--space-3) var(--space-4);
}
.control-deck__row { width: 100%; max-width: 1100px; margin: 0 auto; }
.control-deck__play { min-width: 3rem; }
.control-deck__time {
  font-variant-numeric: tabular-nums;   /* so the clock does not jitter as digits change */
  font-size: var(--text-sm);
}
.control-deck__scrub { flex: 1 1 auto; min-width: 8rem; }
.control-deck__extra { flex: 0 0 auto; }

@media (max-width: 600px) {
  .control-deck__extra { display: none; }   /* the scrubber wins the narrow screen */
}
```

- [ ] **Step 5: Run, full suite, commit**

```bash
cd frontend && npx vitest run src/chart/ControlDeck.test.tsx && npm test && npm run build
```

```bash
git add frontend/src/chart/ControlDeck.tsx frontend/src/chart/ControlDeck.test.tsx frontend/src/index.css
git commit -m "feat(chart): a control deck, pinned to the bottom

Everything you reach for while a song is running now lives in one place,
always the same place: play, the scrubber, the clock, and the tempo/key the
sheet hands in. They were scattered between the native <audio> element and
the page title row.

Bottom-pinned on purpose. A phone app is on the roadmap, the bottom edge is
the thumb zone, and putting the transport there today costs nothing and saves
the move later.

The deck is SILENT — no live regions, no role=status. During playback the user
is listening, and speech competes with the music."
```

---

### Task 6: The docked panel — kill the DOM-measured offset

**Files:**
- Modify: `frontend/src/ui/Panel.tsx`, `frontend/src/ui/Panel.test.tsx`
- Modify: `frontend/src/chart/SegmentEditor.tsx`, `frontend/src/practice/ChordGuess.tsx`
- Modify: `frontend/src/ui/noInlineStyle.test.ts`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/pages/ChartEditorPage.edit.test.tsx`

The panel is currently positioned by a **pixel offset measured from the DOM** (`ChartSheet.tsx:78-89` — a `useLayoutEffect` that reads `getBoundingClientRect()` on every chart change and every window resize, so the panel lines up with the chord's row). It is fragile, it fights every responsive change, and it is why `Panel` has an inline style at all.

It becomes a **docked side panel**: a fixed column beside the chart on a wide screen, dropping below it on a narrow one. That is a natural bottom sheet when the phone arrives.

**This task deliberately kills three assertions.** They pin the mechanism, not the behaviour:
- `ui/Panel.test.tsx` — "keeps `top` as an inline style"
- `ui/Panel.test.tsx` — "does not let a caller clobber the measured `top` offset"
- `pages/ChartEditorPage.edit.test.tsx` — the `editor.style.top` assertion (**grep for `style.top` to find it**)

**Interfaces:**
- Produces: `PanelProps` **loses `top`**. Everything else (`title`, `onClose`, `className`, and the `{...rest}`-first spread order) is unchanged.

- [ ] **Step 1: Find every trace of the old mechanism**

```bash
cd frontend && grep -rn "editorTop\|style\.top\|\btop\b" src/ui/Panel.tsx src/ui/Panel.test.tsx src/chart/ChartSheet.tsx src/chart/SegmentEditor.tsx src/practice/ChordGuess.tsx src/pages/ChartEditorPage.edit.test.tsx src/ui/noInlineStyle.test.ts
```

Read every hit before changing anything.

- [ ] **Step 2: Write the failing test**

Replace the two `top` tests in `frontend/src/ui/Panel.test.tsx` with:

```tsx
  it("carries no inline style at all — the docked panel is positioned by CSS", () => {
    // Phase 1 kept ONE sanctioned inline style here: a pixel offset measured from the DOM,
    // recomputed on every chart change and window resize, to line the panel up with its
    // chord's row. Phase 2 docks the panel, so that offset is dead — and with it the last
    // inline style in src/ui.
    const { container } = render(<Panel title="Edit segment" />);
    expect((container.firstElementChild as HTMLElement).getAttribute("style")).toBeNull();
  });

  it("still lets a caller pass their own style through", () => {
    const { container } = render(<Panel title="Edit segment" style={{ color: "red" }} />);
    expect((container.firstElementChild as HTMLElement).style.color).toBe("red");
  });
```

And in `frontend/src/pages/ChartEditorPage.edit.test.tsx`, replace the `editor.style.top` assertion with one that tests the **behaviour** the old one was standing in for — that selecting a chord opens the editor *for that chord*:

```tsx
  it("opens the editor for the chord that was selected", () => {
    // The old assertion here checked `editor.style.top !== ""` — it was testing the
    // absolute-positioning MECHANISM, not any behaviour a user could observe. The docked
    // panel has no `top`, and good riddance. What actually matters is that the panel that
    // opens belongs to the chord you clicked.
    // (Adapt the setup to this file's existing helpers.)
    const editor = screen.getByRole("group", { name: /edit segment/i });
    expect(editor).toBeInTheDocument();
    expect(within(editor).getByLabelText(/beats/i)).toBeInTheDocument();
  });
```

**Adapt to the file's existing render helpers and selection steps — read it first. Do not delete any other test in it, and above all do not touch the keyboard test (`Tab` to a chord, `Enter` opens the editor with a half-beat Beats field): that test is what makes the drag-to-resize scope cut safe.**

- [ ] **Step 3: Run and watch fail**

```bash
cd frontend && npx vitest run src/ui/Panel.test.tsx src/pages/ChartEditorPage.edit.test.tsx
```

Expected: FAIL — `Panel` still emits `style="top: ..."` when handed a `top`, and the new no-inline-style assertion trips.

- [ ] **Step 4: Strip `top` from `Panel`**

In `frontend/src/ui/Panel.tsx`: delete the `top` prop from `PanelProps`, delete it from the destructure, and render `style={style}` (a caller's own style still passes through). Delete the comment about the measured offset — it is no longer true.

```tsx
export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: string;
  children?: ReactNode;
  onClose?: () => void;
}
```
```tsx
export default function Panel({ title, children, onClose, className, style, ...rest }: PanelProps) {
  return (
    <div
      {...rest}
      role="group"
      aria-label={title}
      className={className ? `card chart-panel ${className}` : "card chart-panel"}
      data-padding="3"
      style={style}
    >
```

- [ ] **Step 5: Stop passing `top`**

- `frontend/src/chart/SegmentEditor.tsx` — remove the `top` prop from its own props interface, its destructure, and the `<Panel top={top}>` it forwards.
- `frontend/src/practice/ChordGuess.tsx` — same.
- `frontend/src/chart/ChartSheet.tsx` — delete the `editorTop` state (`:47`), the whole DOM-measuring `useLayoutEffect` (`:78-89`), the `chartArea` ref if nothing else uses it, and the `top={editorTop}` on both `<ChordGuess>` and `<SegmentEditor>`.

**Keep** `ChartSheet`'s click-off/Escape dismissal `useEffect` (`:95-111`) — that is behaviour, not positioning.

- [ ] **Step 6: Dock the panel in CSS**

In `frontend/src/index.css`, **replace** the `.chart-area` / `.chart-panel` block and its `@media (max-width: 1320px)` override with:

```css
/* ---- The docked editing panel --------------------------------------------------------
   Was: absolutely positioned, its `top` measured from the DOM on every chart change and
   every window resize, so it lined up with its chord's row. That was fragile, it fought
   every responsive change, and it was the last inline style in src/ui.

   Now: a docked column beside the chart. On a narrow screen it drops below — which is a
   natural bottom sheet the day the phone app lands. */
.chart-workspace {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-4);
  align-items: start;
}
@media (min-width: 900px) {
  .chart-workspace[data-panel-open="true"] {
    grid-template-columns: 1fr minmax(14rem, 18rem);
  }
}
.chart-panel { position: static; width: auto; box-shadow: var(--shadow-panel); }
.chart-panel label { display: grid; gap: var(--space-1); }
.chart-panel select, .chart-panel input { width: 100%; }
```

Delete `.chart-area { position: relative; ... }` — nothing positions against it now.

- [ ] **Step 7: Update the guard's allow-list**

In `frontend/src/ui/noInlineStyle.test.ts`, **remove the `"src/ui/Panel.tsx"` entry** from `ALLOWED`. Its reason string literally says *"Phase 2 removes this whole mechanism"* — this is that removal. `Panel` has no inline style now, and an allow-list entry for a clean file is a standing invitation for one to sneak back in.

`ALLOWED` should be left holding exactly two files: `src/chart/Timeline.tsx` and `src/chart/ScrubBar.tsx`. **`src/chart/ChartSheet.tsx` is not on the list** — it never had an inline style of its own; it only passed `top` down as a prop. Do not go looking for it.

After this, **`src/ui/` has zero inline styles.** The only ones left in the app are the four runtime-geometry ones in `Timeline` and `ScrubBar`.

- [ ] **Step 8: Run, full suite, commit**

```bash
cd frontend && npm test && npm run build
```

Expected: PASS. The suite total will change — report it.

**Verify by hand that the panel still opens beside the chart and closes on Escape and on a click outside.** No test covers the visual dock (jsdom does not lay out).

```bash
git add -A
git commit -m "refactor(chart): dock the editing panel; delete the DOM-measured offset

The panel was absolutely positioned, its \`top\` read from getBoundingClientRect()
on every chart change and every window resize so it lined up with its chord's
row. Fragile, at war with every responsive change, and the reason Panel had an
inline style at all.

It is now a docked column beside the chart, dropping below it on a narrow
screen — which is a natural bottom sheet the day the phone app lands.

Three assertions died and all three deserved to: two pinned Panel's \`top\`
inline style, and ChartEditorPage's asserted \`editor.style.top !== ''\` — it was
testing the positioning MECHANISM, not any behaviour a user could observe. It is
replaced by one that checks the panel which opens belongs to the chord you
picked.

src/ui now has ZERO inline styles, so Panel comes off the guard's allow-list."
```

---

### Task 7: Focus goes into the panel, and comes back

A panel that opens without taking focus is invisible to a keyboard user — they press Enter on a chord, the editor appears, and their focus is still on the chord. A panel that closes without *returning* focus dumps them at the top of the document.

**Files:**
- Create: `frontend/src/ui/useReturnFocus.ts`, `frontend/src/ui/useReturnFocus.test.tsx`
- Modify: `frontend/src/ui/Panel.tsx`, `frontend/src/ui/Panel.test.tsx`

**Interfaces:**
- Produces: `useReturnFocus(active: boolean): RefObject<HTMLElement>` — when `active` flips true it remembers `document.activeElement`, moves focus into the returned ref's element, and on flipping false returns focus to whatever had it.
- `Panel` calls it internally. No new `Panel` prop.

- [ ] **Step 1: Write the failing test**

`frontend/src/ui/useReturnFocus.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import useReturnFocus from "./useReturnFocus";

function Harness() {
  const [open, setOpen] = useState(false);
  const ref = useReturnFocus(open);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <div ref={ref} tabIndex={-1} data-testid="panel">
          <button onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </>
  );
}

describe("useReturnFocus", () => {
  it("moves focus into the panel when it opens", async () => {
    // Without this, a keyboard user presses Enter on a chord, the editor appears, and
    // their focus is still on the chord. The panel may as well not exist.
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByTestId("panel")).toHaveFocus();
  });

  it("returns focus to whatever opened it when it closes", async () => {
    // Without this, closing dumps the user at the top of the document and they have to
    // Tab all the way back to where they were.
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    await userEvent.click(opener);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(opener).toHaveFocus();
  });

  it("does not steal focus while closed", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Open" })).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
cd frontend && npx vitest run src/ui/useReturnFocus.test.tsx
```

Expected: FAIL — `Failed to resolve import "./useReturnFocus"`.

- [ ] **Step 3: Implement**

`frontend/src/ui/useReturnFocus.ts`:

```ts
import { useEffect, useRef, type RefObject } from "react";

/** Move focus into a panel when it opens; give it back when it closes.
 *
 *  Without the first half, a keyboard user presses Enter on a chord, the editor appears,
 *  and their focus is still sitting on the chord — the panel may as well not exist.
 *
 *  Without the second half, closing the panel dumps them at the top of the document and
 *  they have to Tab all the way back to the chord they were working on. */
export default function useReturnFocus(active: boolean): RefObject<HTMLElement> {
  const ref = useRef<HTMLElement>(null);
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
```

- [ ] **Step 4: Wire it into `Panel`**

In `frontend/src/ui/Panel.tsx`: call `const ref = useReturnFocus(true)` (a `Panel` is only mounted when it is open, so its mount *is* its opening), attach `ref` to the root div, and give the root `tabIndex={-1}` so it can receive focus programmatically without entering the tab order.

**`Panel` already uses `forwardRef`** (Phase 1 added it so `ChordGuess` could keep its shake-replay trick). **You must merge the two refs, not replace the forwarded one** — dropping it silently breaks `ChordGuess`'s shake. Merge with a callback ref:

```tsx
const focusRef = useReturnFocus(true);
const setRefs = useCallback(
  (node: HTMLDivElement | null) => {
    (focusRef as MutableRefObject<HTMLElement | null>).current = node;
    if (typeof forwarded === "function") forwarded(node);
    else if (forwarded) (forwarded as MutableRefObject<HTMLDivElement | null>).current = node;
  },
  [focusRef, forwarded],
);
```

Add to `frontend/src/ui/Panel.test.tsx`:

```tsx
  it("takes focus when it opens", () => {
    const { container } = render(<Panel title="Edit segment" />);
    expect(container.firstElementChild).toHaveFocus();
  });

  it("still forwards its ref — ChordGuess's shake depends on it", () => {
    // Phase 1 added forwardRef so ChordGuess could replay its shake without remounting the
    // form and dropping focus. Merging the focus ref must not drop the forwarded one.
    const seen = { current: null as HTMLElement | null };
    render(<Panel title="Edit segment" ref={seen} />);
    expect(seen.current).toBeInstanceOf(HTMLElement);
  });
```

- [ ] **Step 5: Run, full suite, commit**

```bash
cd frontend && npm test && npm run build
```

Expected: PASS — **including `ChordGuess.test.tsx`'s "a second wrong answer shakes again"**. If that one fails, you dropped the forwarded ref; go back to Step 4.

```bash
git add -A
git commit -m "feat(ui): panels take focus on open and give it back on close

Without the first half, a keyboard user presses Enter on a chord, the editor
appears, and their focus is still on the chord — the panel may as well not
exist. Without the second half, closing dumps them at the top of the document.

Focus is only returned if it is still inside the panel being closed: if the
user has already Tabbed away, yanking them back is the rude version of being
helpful.

The focus ref is MERGED with Panel's forwarded ref, not substituted for it —
ChordGuess's shake-replay depends on the forwarded one, and dropping it makes
the shake silently stop firing."
```

---

### Task 8: The chart becomes a semantic sequence

Right now the chart is a pile of `<button>`s in unlabelled `<div>`s. A screen-reader user gets `"C, button"` with no idea where in the song they are, how long the chord lasts, or that a bar starts there.

**Files:**
- Modify: `frontend/src/chart/Timeline.tsx`, `frontend/src/chart/Timeline.test.tsx`
- Create: `frontend/src/chart/WhereAmI.tsx`, `frontend/src/chart/WhereAmI.test.tsx`

**Interfaces:**
- Consumes: `barBeatAt`, `formatMusicalPosition`, `BeatGridInfo` (Task 1); `usePlayback` (Task 3).
- Produces: `Timeline` gains `grid: BeatGridInfo`. `WhereAmI({ grid }: { grid: BeatGridInfo }): JSX.Element`.

- [ ] **Step 1: FIRST, guard the thing this task can silently break**

**`Timeline.test.tsx` currently has NO assertion on the beat-derived cell width.** I checked. That means the riskiest change in this task — moving the `flex: ${beats} 1 0` ratio from the `<button>` onto a wrapper — has nothing guarding it. Get it wrong and *every chord renders the same width*: the chart stops showing rhythm at all, and not one test notices.

So write this **before** you refactor, and watch it pass against the *current* code. It is a characterisation test: it pins behaviour that already works so the refactor cannot quietly take it away.

Append to `frontend/src/chart/Timeline.test.tsx`:

```tsx
it("sizes each cell by its beat count — the width IS the rhythm", () => {
  // A 4-beat chord must be twice as wide as a 2-beat one. That is not decoration: it is
  // how the chart shows rhythm, and it is the single thing in this file that can break
  // silently — no accessibility assertion would notice every chord going the same width.
  //
  // Written BEFORE the semantic-list refactor moves this ratio from the <button> to its
  // wrapper. It must keep passing across that move.
  const segs = [
    { ...BASE, id: "s1", start_beat: 0, end_beat: 4, start_time: 0, end_time: 2 },
    { ...BASE, id: "s2", start_beat: 4, end_beat: 6, start_time: 2, end_time: 3 },
  ];
  renderTimeline({ segments: segs });

  // Find whichever element carries the ratio — today the button, after the refactor its
  // wrapper. Asserting on the *rendered ratio* rather than on a specific tag is what lets
  // this test survive the refactor it exists to guard.
  const flexOf = (id: string) => {
    const cell = document.querySelector<HTMLElement>(`[data-segment-id="${id}"]`)!;
    const carrier = cell.style.flex ? cell : (cell.parentElement as HTMLElement);
    return carrier.style.flex;
  };

  expect(flexOf("s1")).toBe("4 1 0");
  expect(flexOf("s2")).toBe("2 1 0");
});
```

**Adapt `BASE` / `renderTimeline` to whatever the file already uses — read it first.** Run it now:

```bash
cd frontend && npx vitest run src/chart/Timeline.test.tsx -t "width IS the rhythm"
```

Expected: **PASS against the current code.** If it fails, you have mis-read the existing helpers — fix the test, not the component. Commit it on its own before going further:

```bash
git add frontend/src/chart/Timeline.test.tsx
git commit -m "test(chart): guard the beat-derived cell width before refactoring it

Nothing asserted that a 4-beat chord is twice as wide as a 2-beat one. It is
how the chart shows rhythm, and the next commit moves that ratio onto a new
wrapper element — a move that, done wrong, makes every chord the same width
with no test noticing."
```

- [ ] **Step 2: Now write the failing tests**

Append to `frontend/src/chart/Timeline.test.tsx` (reuse its existing render helper and pass the new `grid` prop to every existing render):

```tsx
describe("the chart is a semantic sequence, not a pile of divs", () => {
  it("names itself, so a screen-reader user can find it", () => {
    renderTimeline();
    expect(screen.getByRole("list", { name: /chord chart/i })).toBeInTheDocument();
  });

  it("tells a player where each chord IS, how long it lasts, and whether a bar starts", () => {
    // "C, button" is what the chart said before. It gave a blind or low-vision player no
    // idea where in the song they were, how long to stay on the chord, or that a bar
    // started there. All three are things a sighted player reads off the page instantly.
    renderTimeline();
    const cells = screen.getAllByRole("button", { name: /bar \d+/i });
    expect(cells.length).toBeGreaterThan(0);
    expect(cells[0]).toHaveAccessibleName(/bar 1, beat 1/i);
    expect(cells[0]).toHaveAccessibleName(/beats/i);
  });

  it("says a bar starts here, without relying on the colour that says so visually", () => {
    // The measure rule is a graphical object. A screen reader cannot see 3px of --bar-line.
    renderTimeline();
    const barStart = screen.getAllByRole("button", { name: /starts a bar/i });
    expect(barStart.length).toBeGreaterThan(0);
  });

  it("keeps a masked chord's secret while still saying where it is", () => {
    // Practice mode: the chord is the question. The position and the length are the
    // question's CONTEXT and must survive — a player needs the rhythm to guess against.
    renderTimeline({ maskedIds: new Set(["s1"]) });
    const masked = screen.getByRole("button", { name: /hidden chord/i });
    expect(masked).toHaveAccessibleName(/bar 1/i);
    expect(masked).not.toHaveAccessibleName(/major|minor|\bC\b/i);
  });
});
```

`frontend/src/chart/WhereAmI.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WhereAmI from "./WhereAmI";
import { PlaybackProvider } from "./PlaybackContext";
import type { BeatGridInfo } from "./musicalPosition";

const GRID: BeatGridInfo = {
  beatTimes: Array.from({ length: 33 }, (_, i) => i * 0.5),
  bpm: 120,
  duration: 16,
  beatsPerMeasure: 4,
  measureOffset: 0,
};

const renderIt = () =>
  render(
    <PlaybackProvider>
      <WhereAmI grid={GRID} />
    </PlaybackProvider>,
  );

describe("WhereAmI", () => {
  it("says nothing until it is asked", () => {
    // This exists BECAUSE we are not allowed a live region. During playback the user is
    // listening, and a chart that narrated every chord change would talk over the song
    // they are trying to learn. So: on demand, never volunteered.
    const { container } = renderIt();
    expect(container.querySelector("[aria-live]")?.textContent ?? "").toBe("");
  });

  it("reports the position into a polite live region when pressed", async () => {
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: /where am i/i }));
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent(/bar 1, beat 1/i);
  });

  it("is polite, not assertive — it must never interrupt", async () => {
    // aria-live="assertive" would cut across whatever the screen reader was saying.
    // The user asked a question; they can wait a beat for the answer.
    renderIt();
    await userEvent.click(screen.getByRole("button", { name: /where am i/i }));
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
cd frontend && npx vitest run src/chart/Timeline.test.tsx src/chart/WhereAmI.test.tsx
```

- [ ] **Step 3: Make the chart a semantic sequence**

In `frontend/src/chart/Timeline.tsx`, add `grid: BeatGridInfo` to `Props`, then make three changes.

**(a) The accessible label.** Inside the cell `.map`, before the `return`:

```tsx
// A sighted player reads position, length and the bar line off the page instantly.
// "C, button" — which is all the old markup said — gave a screen-reader user none of it.
//
// A MASKED chord keeps its secret but keeps its position and its length: in practice mode
// the chord is the question, but the rhythm is the question's CONTEXT and a player needs
// something to guess against.
const what = masked ? "Hidden chord" : chordLabel(s.chord_root, s.chord_quality);
const where = formatMusicalPosition(barBeatAt(grid, s.start_time)); // "bar 3, beat 1"
const howLong = `${beats} ${beats === 1 ? "beat" : "beats"}`;
// The measure rule is a graphical object. A screen reader cannot see 3px of --bar-line,
// so it has to be said.
const startsBar = onMeasure ? ", starts a bar" : "";

const label = `${what}, ${where}, ${howLong}${startsBar}`;
```

Put `aria-label={label}` on the `<button>`, **replacing** the current conditional `aria-label={masked ? ... : undefined}`.

**(b) The markup — one list, one item per chord.** Replace the outer `<div className="chart-lines">` / `<div className="chart-line">` wrappers with:

```tsx
<ul className="chart-lines" aria-label="Chord chart">
  {lines.map((line, li) => (
    // A LINE is a layout artefact — the chart wraps at whatever width the window happens
    // to be, and a line break means nothing musically. role="presentation" keeps it out of
    // the accessibility tree: a screen-reader user must not be told about a break that a
    // wider window would remove. The chords are the list; the lines are just where they
    // landed today.
    <li key={li} className="chart-line" role="presentation">
      {line.map((s) => {
        /* … existing per-cell logic, then: … */
        return (
          <span
            key={s.id}
            role="listitem"
            className="chord-cell__item"
            // Runtime geometry ONLY: the cell's width IS the chord's beat count. This moved
            // off the <button> and onto its wrapper, because the wrapper is now the flex
            // child. Losing it makes every chord the same width — and NO a11y test would
            // catch that.
            style={{ flex: `${beats} 1 0` }}
          >
            <button type="button" className="chord-cell" aria-label={label} /* …rest unchanged… */>
              {/* … children unchanged … */}
            </button>
          </span>
        );
      })}
    </li>
  ))}
</ul>
```

Note the item is a `<span role="listitem">`, not an `<li>`: an `<li>` inside a `role="presentation"` parent would be an orphan, and a `<span>` with an explicit role sidesteps the HTML content-model rule entirely while giving the accessibility tree exactly the flat chord list we want.

**The `<button>` keeps every existing attribute** — `data-bar-start`, `data-selected`, `data-playing`, `data-masked`, `data-segment-id`, `aria-pressed`, `onClick`, `onKeyDown`, and both resize handles — **and loses only its inline `style`**, which moves to the wrapper.

**(c) The CSS.** In `frontend/src/index.css`:

```css
.chart-lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.chart-line  { list-style: none; display: flex; justify-content: flex-start; gap: 0; }
/* The flex CHILD, carrying the beat-derived ratio set inline. */
.chord-cell__item { display: flex; min-width: 0; }
/* The button now fills its item rather than being the flex child itself. */
.chord-cell { width: 100%; }
```

**The `flex` ratio moving from the button to the wrapper is the one thing in this task that can silently break.** If it lands on the wrong element every chord renders the same width, the chart stops showing rhythm at all, and no accessibility assertion will notice. `Timeline.test.tsx` already has width/ratio assertions — **run them and watch them, and check the chart by eye in Task 10.**

- [ ] **Step 4: Implement `WhereAmI`**

`frontend/src/chart/WhereAmI.tsx`:

```tsx
import { useState } from "react";
import Button from "../ui/Button";
import { usePlayback } from "./PlaybackContext";
import { barBeatAt, formatMusicalPosition, type BeatGridInfo } from "./musicalPosition";

/** The on-demand "where am I".
 *
 *  This exists precisely BECAUSE we are not allowed a live region on the chart. During
 *  playback the user is listening; a chart that announced every chord change as it played
 *  would talk over the song they are trying to learn — the assistive equivalent of someone
 *  shouting the chords at you while you practise.
 *
 *  So the app never volunteers its position. It answers when asked. */
export default function WhereAmI({ grid }: { grid: BeatGridInfo }) {
  const clock = usePlayback();
  const [said, setSaid] = useState("");

  return (
    <>
      <Button
        onClick={() => setSaid(formatMusicalPosition(barBeatAt(grid, clock.currentTime)))}
      >
        Where am I?
      </Button>
      {/* Polite, never assertive: the user asked a question, they can wait a beat for the
          answer. Assertive would cut across whatever the reader was already saying. */}
      <span role="status" aria-live="polite" className="visually-hidden">
        {said}
      </span>
    </>
  );
}
```

Add to `index.css`:

```css
/* Available to a screen reader, invisible on screen. The standard clip-rect recipe —
   display:none and visibility:hidden would hide it from assistive tech too. */
.visually-hidden {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 5: Run, full suite, commit**

```bash
cd frontend && npm test && npm run build
```

```bash
git add -A
git commit -m "feat(chart): the chart is a semantic sequence a screen reader can read

It was a pile of buttons in unlabelled divs. A blind or low-vision player got
'C, button' — no idea where in the song they were, how long the chord lasts,
or that a bar starts there. All three are things a sighted player reads off
the page instantly.

Each cell now announces 'C major, bar 3, beat 1, 2 beats, starts a bar'. The
line wrappers are role=presentation: a line is a LAYOUT artefact — it exists
because the chart wraps at the window's width and means nothing musically. A
screen-reader user must not be told about a line break a wider window would
remove.

A masked chord keeps its secret but keeps its position and its length: in
practice mode the chord is the question, but the rhythm is the question's
context and a player needs it to guess against.

WhereAmI is the on-demand position readout — it exists BECAUSE we are not
allowed a live region. The app never volunteers where it is; it answers when
asked."
```

---

### Task 9: The three zones

Wire it together. The context bar recedes; the chart becomes the hero; the deck is pinned.

**Files:**
- Create: `frontend/src/chart/ChartContextBar.tsx`, `frontend/src/chart/ChartContextBar.test.tsx`
- Modify: `frontend/src/chart/ChartSheet.tsx`, `frontend/src/pages/ChartEditorPage.tsx`, `frontend/src/pages/GuestHomePage.tsx`, `frontend/src/index.css`

**Interfaces:**
- Consumes: `usePlayback` (3), `ControlDeck` (5), `WhereAmI` (8), `BeatGridInfo` (1).
- Produces: `ChartContextBar({ title, back, actions }: { title: string; back?: ReactNode; actions?: ReactNode }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

`frontend/src/chart/ChartContextBar.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ChartContextBar from "./ChartContextBar";
import { PlaybackProvider, usePlayback } from "./PlaybackContext";

function Harness({ playing }: { playing: boolean }) {
  return (
    <PlaybackProvider>
      <ChartContextBar title="Song.m4a" actions={<button>Practice mode</button>} />
      {playing && <ForcePlaying />}
    </PlaybackProvider>
  );
}

/** Drive `playing` by dispatching the real media event the clock listens for. */
function ForcePlaying() {
  const clock = usePlayback();
  return (
    <audio
      ref={(el) => {
        if (!el) return;
        (clock.ref as React.MutableRefObject<HTMLAudioElement | null>).current = el;
        el.dispatchEvent(new Event("play"));
      }}
    />
  );
}

describe("ChartContextBar", () => {
  it("shows the song and its actions", () => {
    render(<Harness playing={false} />);
    expect(screen.getByRole("heading", { name: "Song.m4a" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Practice mode" })).toBeInTheDocument();
  });

  it("marks itself as receded while the song plays", () => {
    // In play-along your eyes are on your hands. Chrome you are not using is chrome in the
    // way — the SAME instinct as the screen-reader rule that the app stays quiet while
    // playing. When two constraints want the same thing, it is a real principle.
    //
    // It RECEDES, it does not VANISH: a control you cannot find is worse than one you can
    // ignore. CSS dims it; it stays in the DOM, focusable, and one Tab away.
    const { container } = render(<Harness playing />);
    const bar = container.querySelector(".chart-context-bar");
    expect(bar).toHaveAttribute("data-receded", "true");
    expect(screen.getByRole("button", { name: "Practice mode" })).toBeInTheDocument();
  });

  it("is not receded while paused", () => {
    const { container } = render(<Harness playing={false} />);
    expect(container.querySelector(".chart-context-bar")).not.toHaveAttribute("data-receded");
  });
});
```

- [ ] **Step 2: Run and watch fail**

```bash
cd frontend && npx vitest run src/chart/ChartContextBar.test.tsx
```

- [ ] **Step 3: Implement the context bar**

`frontend/src/chart/ChartContextBar.tsx`:

```tsx
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
```

- [ ] **Step 4: Restructure `ChartSheet` into the three zones**

`ChartSheet` now:
- consumes `usePlayback()` instead of calling `useMediaClock()` itself;
- renders the `<audio>` element **without `controls`** (the deck is the controls now) — keep `ref={clock.ref}` and `src={audioSrc}`, add `className="visually-hidden"` so it does not occupy space;
- builds the `grid: BeatGridInfo` once from the chart and passes it to `Timeline`, `ControlDeck` and `WhereAmI`:

```tsx
const grid: BeatGridInfo = {
  beatTimes: chart.beat_times,
  bpm,
  duration,
  beatsPerMeasure: chart.beats_per_measure,
  measureOffset: chart.measure_offset,
};
```

- wraps the chart + panel in `<div className="chart-workspace" data-panel-open={selected ? "true" : undefined}>`;
- moves the tempo/key `Stack` **into the deck** as its `children`;
- renders `<ControlDeck grid={grid}>{tempoAndKey}</ControlDeck>` as the last element.

**GATE THE PRACTICE LIVE REGION ON `!playing`.** `ChartSheet.tsx:170` currently has `<p className="muted chart-practice-status" role="status">`. That is a **live region**, and it must not fire while the song is playing:

```tsx
{practice && (
  <p
    className="muted chart-practice-status"
    // role="status" ONLY while paused. During playback the user is listening, and this
    // would announce "3 of 8 chords named" over the top of the song. The text stays on
    // screen either way — it just stops SPEAKING.
    role={clock.playing ? undefined : "status"}
  >
```

- [ ] **Step 5: Add the layout CSS**

```css
/* ---- Zone 1: the context bar --------------------------------------------------------- */
.chart-context-bar { padding-bottom: var(--space-3); transition: opacity 200ms ease; }
.chart-context-bar__title { margin: 0; font-size: var(--text-xl); }

/* Recedes while playing — eyes on hands, not on chrome. It DIMS; it does not disappear:
   a control you cannot find is worse than one you can ignore, and it stays focusable. */
.chart-context-bar[data-receded="true"] { opacity: 0.45; }
.chart-context-bar[data-receded="true"]:hover,
.chart-context-bar[data-receded="true"]:focus-within { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .chart-context-bar { transition: none; }
}

/* ---- Zone 2: the chart is the hero --------------------------------------------------
   It was boxed into the same 880px column as a login form. It is the product; give it
   the room. */
.chart-page { max-width: 1100px; margin: 0 auto; padding: var(--space-4); }
```

- [ ] **Step 6: Wire the pages**

`ChartEditorPage.tsx`: wrap the whole return in `<PlaybackProvider>`, swap `<div className="container">` for `<div className="chart-page">`, and replace the hand-rolled `<p><Link/></p>` + `<Stack><h1/>…</Stack>` header with `<ChartContextBar title={…} back={<Link to="/">← Library</Link>} actions={…} />`. **Keep the Re-analyze and mode-switch buttons exactly as they are** — just pass them as `actions`.

`GuestHomePage.tsx`: wrap its `ChartSheet` in `<PlaybackProvider>`. It has marketing copy above the chart; leave that alone.

- [ ] **Step 7: Run, full suite, commit**

```bash
cd frontend && npm test && npm run build
```

Expected: PASS. Some page tests will need `PlaybackProvider` in their wrapper — **add it to the shared helper in `frontend/src/test/utils.tsx` if that is where the other providers live**, rather than patching each file.

```bash
git add -A
git commit -m "feat(chart): three zones — receding context bar, hero chart, pinned deck

The chart page had no layout system: a back link, an <h1> with buttons crammed
beside it, an <audio> element, and panels positioned by a measured pixel offset,
all inside the same 880px column as a login form.

Now: a context bar that RECEDES while the song plays (eyes on hands — chrome you
are not using is chrome in the way, which is the same instinct as the rule that
the app stays quiet for a screen reader during playback); the chart as a
full-width hero, because it is the product; and the transport in one pinned deck.

The practice-mode status line's role=status is now gated on !playing. It was a
live region that would have announced '3 of 8 chords named' over the top of the
song. The text stays on screen either way — it just stops speaking."
```

---

### Task 10: Close the phase — drive the real app

Tests cannot tell you whether it *looks* right, or whether you can actually use it by ear and by keyboard.

- [ ] **Step 1: Suite and build**

```bash
cd frontend && npm test && npm run build
```

- [ ] **Step 2: Run it**

```bash
# terminal 1 — use a throwaway DB so you do not touch real data
TABIT_DATABASE_URL="sqlite:///tmp/phase2.db" TABIT_STORAGE_DIR=/tmp/phase2-storage \
  TABIT_ANALYSIS_ENGINE=librosa uvicorn app.main:app --port 8000
# terminal 2
cd frontend && npm run dev
```

**A dev server may already be running on :5173 from another checkout — check the port Vite actually prints.**

Upload `tests/eval/I V IV I.m4a`, let it analyse, open the chart.

- [ ] **Step 3: Look at it, in both themes**

- [ ] The context bar **dims** when you press play, and comes back when you pause or hover it.
- [ ] The deck is pinned to the bottom and stays there as the page scrolls.
- [ ] The editing panel opens **beside** the chart on a wide window, and **below** it on a narrow one. Resize and watch.
- [ ] The chart has the room — it is not boxed into a login form's column.
- [ ] Nothing is invisible or unstyled in either theme.

- [ ] **Step 4: Use it with the mouse in a drawer**

- [ ] `Tab` reaches the play button, the scrubber, and every chord.
- [ ] `Enter` on a chord opens the editor **and focus lands inside it**.
- [ ] `Escape` closes the panel **and focus returns to the chord you came from**.
- [ ] Arrow keys on the scrubber seek.
- [ ] The focus ring is visible everywhere, in both themes.
- [ ] "Where am I?" answers.

- [ ] **Step 5: Listen to it**

Turn on a screen reader (`orca` on Linux; VoiceOver on macOS).

- [ ] Move the scrubber. It should say **"bar 12, beat 2"** — *not* a number of seconds.
- [ ] Tab across the chart. Each chord should say what it is, where it is, how long it lasts, and whether a bar starts there.
- [ ] **Press play, then leave it alone. It must be SILENT.** If anything narrates while the music runs, a live region has leaked in — find it and gate it on `!playing`. **This is the rule the whole phase turns on.**

- [ ] **Step 6: Commit and open the PR**

```bash
git add -A && git commit -m "chore: phase 2 verification pass"
git push -u origin <branch>
gh pr create --draft --title "Redesign Phase 2: the chart page" --body "..."
```

---

## Self-Review

**Spec coverage** — every Phase 2 item in the spec's delivery table maps to a task:

| Spec requirement | Task |
|---|---|
| Three zones: receding context bar, hero chart, pinned control deck | 9 (5 builds the deck) |
| Docked side panel replaces the measured-pixel `top` | 6 |
| Revive `ScrubBar` | 4 (rendered by 5) |
| Chord cells are real focusable buttons | *Phase 1 — already done* |
| The chart is a semantic sequence | 8 |
| Scrubber's `aria-valuetext` in musical terms | 1 (maths) + 4 (wiring) |
| Panels move focus in on open, return it on close | 7 |
| Quiet while playing — never volunteers speech, may answer when spoken to | 4 (slider), 5 (deck), 8 (`WhereAmI` exists *because* of this), 9 (gates the practice status line; `ChordGuess`'s answers stay ungated) |
| Consolidate actions to one home each | 9 |
| No sidebar | Honoured — five screens do not need one |

**Deferred, and named as such:** the current-chord scale bump, the reveal-as-reward, practice mode's spotlight, and the one-channel "correct guess" bug are all **Phase 3**. Chord-quality colour and the full WCAG audit are **Phase 4**.

**Known risk — Task 8 is the fiddliest, and it had no net.** Making the chart a semantic list means moving the beat-derived `flex` ratio from the `<button>` onto a wrapper. Get it wrong and every chord renders the same width — the chart stops showing rhythm at all — and **no accessibility assertion would catch it.**

I checked, and `Timeline.test.tsx` had **no width assertion whatsoever**. So Task 8 now opens by writing one as a *characterisation test* — pinning the behaviour against the current code, committing it alone, and only then doing the refactor it exists to guard. That inversion is the point: never refactor the one thing in a file that can break silently until something is watching it.

**Verified, not assumed:** the maths in Task 1 was run against a live implementation before this plan was written. Doing so caught a false expectation (a pickup at `t=0.5` gives *bar 1*, not bar 2) and, more importantly, a design bug behind it — clamping `bar` to a minimum of 1 made a one-beat pickup announce *"bar 1, beat 4"* immediately followed by *"bar 1, beat 1"*, i.e. beat 4 before beat 1 inside the same bar. Gibberish read aloud, and a readout a player cannot trust is worse than none. Pickups now say **"pickup, beat 4"**.

**Known risk — Task 6 removes `Panel`'s `top` and Task 7 adds a ref to it.** `Panel` already uses `forwardRef` because `ChordGuess`'s shake-replay depends on it. **Task 7 must MERGE refs, not replace.** `ChordGuess.test.tsx`'s "a second wrong answer shakes again" is the guard.

**Type consistency:** `BeatGridInfo` is defined once (Task 1) and consumed by `ScrubBar` (4), `ControlDeck` (5), `Timeline` (8) and `WhereAmI` (8) under that exact name. `MediaClock` gains `play`/`pause`/`toggle` in Task 2 and nothing renames them.
