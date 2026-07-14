# Visual Redesign — Design

**Date:** 2026-07-13
**Status:** Approved design, ready for planning

## Problem

Tabit's UI is not merely bland — it is **miscast**. The current palette (`--bg: #14161a`,
a lone blue accent `#4f8cff`, cold blue-black surfaces) is DAW chrome. It signals
*"professional tool, you should already know what you're doing."* That is the precise
opposite of the audience.

There is also no design system to redesign *against*:

- **78 inline `style={{...}}` objects** across 17 of ~20 UI components carry all layout,
  spacing, and structure.
- **No reusable primitives.** No `Button`, `Card`, `Field`, `Panel`, or layout wrapper.
  The row `display:flex; gap:12; alignItems:center; flexWrap:wrap` is hand-copied into at
  least five files.
- **Tokens exist for colour only** (9 of them, `index.css:1-15`). No spacing, radius,
  type-scale, or shadow tokens — those are magic numbers inline.
- **Dark-only, permanently.** No `prefers-color-scheme` query, no theme toggle, and no
  `color-scheme` declaration (so native `<audio>` and form widgets can render light
  against the dark UI).
- **Typography is one line:** `font-family: system-ui` (`index.css:14`). No type scale.

Consequence: this is a **component-level refactor, not a stylesheet swap.**

## Audience and use pattern

**Users are beginner-to-moderate musicians, actively practising with an instrument in
hand.** Anyone with a good enough ear not to need Tabit is not the target user.

**Today: desktop/laptop at arm's length only.** A mobile app (upload voice memos for
analysis) is on the roadmap but not in this scope. The rule this imposes: **design for the
laptop now, but build nothing that must be thrown away when a phone arrives** —
responsive layout, a type scale that can grow, and touch-viable hit targets where they are
free. Do not build a mobile UI today.

### The two modes are the two use patterns

This is the central insight of the redesign. Tabit's existing modes are not two features;
they are two fundamentally different activities:

| Mode | Activity | Screen is a… | Design consequence |
|---|---|---|---|
| **Chart** (full analysis shown) | **Play-along.** Audio rolls, user keeps up. | Teleprompter | Chart must be readable with eyes mostly on hands. Chrome should recede. |
| **Practice** (chords hidden, user names them) | **Stop-and-study.** Scrub, listen, guess, get it right. | Workbench | Transport and the guess panel are primary furniture, always reachable. |

Today both render through the same `ChartSheet` with identical chrome; the only difference
is that chords get masked. `ModeChoice` already asks *"How do you want to open this song?"*
— **the visual design has never answered.** It should.

## Design principles

1. **Warm and inviting, and fun to use.** Not a pro tool. Not intimidating.
2. **Fun is concentrated, not sprinkled.** This is on screen for 45-minute practice
   sessions. A perpetually-animating UI is exhausting. Playfulness spends itself in
   exactly two moments (see *Motion*).
3. **Quiet while playing, rich while paused.** During playback the user is *listening*.
   Chrome recedes; the app stops *volunteering* speech. It may still *answer* — see
   *Screen readers* below for why that distinction matters. Accessibility and the
   play-along feel want the same thing — which is how we know it is a real principle and
   not a bolt-on.
4. **Hue is never the only channel.** Every meaning carried by colour carries a second
   channel too.
5. **Theme is about the room; mode is about the app.** They are orthogonal and must not be
   conflated.

## Theme vs mode (orthogonal)

- **Theme** = the physical environment the user is in. Light (bright room) or dark (dim
  bedroom at midnight). **User-toggled**, defaulting to `prefers-color-scheme`, persisted.
- **Mode** = what the app is doing. Chart or practice. **The app decides how to express
  it.**

**Practice mode must NOT be implemented as "the dark theme."** It gets a treatment that
works *in both themes*: the page recedes, the chart desaturates and masks, and the
scrubber plus the guess panel are the only fully-lit things on screen. The lights come
down **relative to wherever the user already was** — so dark-theme users get the spotlight
effect too.

**One design, two palettes.** The light and dark themes are the *same design* — same
cards, same motion, same colour semantics — expressed on warm paper and in warm dark. They
are not two personalities behind a switch.

## Foundation

### Tokens

The only source of visual values in the app. Every one gets a light and dark value where
relevant. Nothing hardcoded, nothing inline.

- **Colour** — extends the existing 9. Also fixes the current leaks: `#2c313a` is written
  literally 5 times instead of `var(--line)` (`index.css:19,22,25,27`; `Header.tsx:14`;
  `UploadDropzone.tsx:55`), plus `#26303f` (`Timeline.tsx:189`), `rgba(255,255,255,0.03)`
  (`UploadDropzone.tsx:59`), and `#fff` (`index.css:21`).
- **Spacing, radius, type-scale, shadow** — none of these exist today.
- **Font tokens:** `--font-ui`, `--font-display`, `--font-chart`. Referenced everywhere,
  hardcoded nowhere, so a future typeface change is one line per token.

### Palette — contrast-validated

Deliberately **warm** in both themes. The dark theme is warm charcoal, explicitly *not*
today's blue-cold `#14161a`. **All 30 WCAG-governed pairs clear AA in both themes** (checked,
not eyeballed; `theme/palette.test.ts` enforces it).

| Role | Light (warm paper) | Dark (warm charcoal) |
|---|---|---|
| `--bg` | `#fdf9f3` | `#1a1714` |
| `--surface` | `#ffffff` | `#232019` |
| `--text` | `#1f1b16` | `#f2ede4` |
| `--muted` | `#635a50` | `#a89d8d` |
| `--line` — decorative hairline | `#c4b8a6` | `#4a443b` |
| `--control-border` — a control's boundary | `#958b7e` | `#787063` |
| `--bar-line` — the measure rule | `#7d7060` | `#9c9280` |
| `--accent` (now / active) | `#b8480f` | `#ff9d4d` |
| `--on-accent` | `#ffffff` | `#241505` |
| `--danger` (wrong) | `#b3261e` | `#ff8a80` |
| `--ok` (correct) | `#1c7a52` | `#5fd39b` |

**Why there are three border tokens where the old design had one.** WCAG 1.4.11 governs the
boundaries of UI *components* and *graphical objects that carry meaning* — it does not reach
decoration. The old `--line` was doing both jobs and doing one badly:

- **`--line`** is a card's edge and the divider between two chords in the same bar. A card is
  not a control; a chord is identified by its own label. Not WCAG-governed — and forcing 3:1
  on it would turn every card into a heavy grey box. But it is held at ~1.85:1 rather than the
  1.48:1 a naive palette lands on, because **a card differs from the page by only 1.05:1**:
  the border and the shadow are what make a card visible at all, not its fill.
- **`--control-border`** is the boundary of an input, select, or button. A real UI component
  boundary. **3:1, enforced.**
- **`--bar-line`** is the measure rule — a graphical object saying *"a bar starts here."*
  **3:1, enforced**, and heavier than `--line` by **both colour and width**. Two channels,
  never hue alone.

Add a `color-scheme` declaration so native controls follow the theme.

### Primitives

`Button`, `Card`, `Field`, `Panel`, and a layout wrapper. These are what the redesign
retargets; without them there is nothing to turn. Accessibility is built into each **once**
rather than re-litigated per call site.

## Typography

**The single biggest lever, currently unpulled.** Default system sans at four arbitrary
sizes is the fastest possible signal that nobody designed this.

- **Figtree**, self-hosted (woff2, in-repo — no Google CDN request, no third-party
  dependency, and a future swap is "replace a file"). It is a **variable** font, so one
  file carries the 300–900 weight range.
- A real **type scale** in tokens, replacing the inline magic numbers.

**Chord cells are sized from a token, not from content.** A chord grid whose cells are
content-sized will re-wrap the entire chart when a wider typeface makes `F♯m7` push its
cell out. Sizing from a token — wide enough for the longest label by design — means a
future font change can alter the chart's *texture* but never its *layout*.

## Layout and navigation

The chart page today has no layout system: a `← Library` text link, an `<h1>` with buttons
crammed beside it, an `<audio>` element, the chart, and panels **positioned by a pixel
offset measured from the DOM** (`ChartSheet.tsx:76-87`). Everything sits in an 880px column
— the same column as a login form — with one breakpoint at 1320px. Actions have no
consistent home: "Re-analyze" exists both beside the title *and* in every library row,
styled differently in each.

### Three zones on the chart page

1. **A context bar that recedes.** Song title, back-to-library, mode switch. During
   playback it slims and fades — in play-along, chrome you are not using is chrome in the
   way.
2. **The chart as hero.** Full width, given the room. It is the product; today it is boxed
   into a login form's column.
3. **A control deck pinned to the bottom.** Play/pause, scrubber, tempo, key — one place,
   always the same place. Today these are scattered between the native `<audio>` element
   and the title row. Bottom-pinning is also **the single decision that most prepares Tabit
   for the phone** (bottom edge = thumb zone), and it costs nothing to take now.

### Other layout decisions

- **The editing panel stops being absolutely positioned.** The measured-pixel `top` is
  fragile and will fight every responsive change. It becomes a **docked side panel** on
  desktop — a natural bottom sheet on mobile later.
- **Revive `ScrubBar.tsx`.** It already exists (131 lines, working, with a passing test) and
  is **commented out** at `ChartSheet.tsx:7` and `:159-167`. The control deck needs it, and
  it must be a custom slider rather than native `<audio>` controls, because native controls
  can only announce *seconds* — meaningless to someone practising. See *Accessibility*.
- **Global nav stays simple.** Header keeps wordmark, Library, account. **No sidebar** —
  five screens do not need one.
- **Consolidate actions to one home each.** Analyze is primary in the library row and
  secondary on the chart page. The mode switch becomes *one* control, with `ModeChoice`
  demoted to the first-open chooser it already is.

## Motion and feedback

Playfulness spends itself in **exactly two moments**. Everything else stays calm. All of it
sits behind the existing `prefers-reduced-motion` guard (`index.css:114`) — motion-triggered
vestibular symptoms are real, and this is the direction with the most motion in it.

### 1. The current chord

Today: a `#26303f` background, and nothing else — subtle even for full-colour vision, and
invisible to some. It should **lift**: colour **plus** a scale bump **plus** a border.
Three channels, which is what the colourblind rule required anyway.

**Build on `chordProgress.ts`, do not replace it.** Its transform-based GPU-transition
scheme is the right approach (transform and opacity only, no layout thrash), and existing
tests protect that mechanism.

### 2. Getting a chord right — *the reward is the reveal*

This must be fixed regardless, because it is an accessibility hole (below). Today: **wrong**
gets red + a shake (two channels ✓); **right** gets a green flash and nothing else (one
channel ✗) — ambiguous for a red-green colourblind user.

The fix is also the better design: the chord the user just named **settles into the cell it
was hiding in.** The information *is* the prize. It needs no colour to be legible, and it is
the moment practice mode exists to produce.

## Accessibility

A first-class requirement, not a checklist. Two constraints, one of which *changes the
design*.

### Colour blindness

**Hue is never the only channel.** Roughly 8% of men have red–green colour deficiency, and
guitar-practice apps skew male.

- Chord cells are already compliant in principle — the cell *says* `Am`, so colour is
  supplementary. Any chord-quality colour layer must remain **supplementary, never the sole
  carrier**.
- **Practice feedback** — fix the one-channel "right" state (see *Motion*).
- **Current-playing chord** — needs its second and third channels (see *Motion*).
- **Contrast: WCAG AA in both themes.** 4.5:1 for text, 3:1 for UI and graphical objects.
  This is the step routinely skipped on dark themes, where a "tasteful muted grey" is
  usually about 2.8:1.

### Screen readers

**The design rule, precisely stated: during playback the app never VOLUNTEERS speech. It
may ANSWER when spoken to.** During playback the user is *listening*, and screen-reader
speech competes with the music for the same channel — a chart announcing every chord
change unprompted would be *actively hostile*. But a message that is a **direct answer to
something the user just did** is not competing for that channel; it is the thing they
asked for. "No live regions during playback" is too crude a restatement of this — taken
literally it would silence `ChordGuess`'s guess feedback, which is exactly the wrong call
(see the table below and *Why practice mode deserves this*).

| Speaker | Volunteers or answers? | Verdict |
|---|---|---|
| Practice status line (*"3 of 8 chords named"*) | volunteers | gated on `!playing` |
| `Spinner` / `AnalyzingIndicator` (*"Analyzing…"*) | volunteers | gated on `!playing` |
| `WhereAmI` (*"bar 12, beat 2"*) | answers — the user pressed a button | speaks; `role="status"` (polite) |
| `ChordGuess` (*"Not that one" / "C major — that's it"*) | answers — the user submitted a guess | speaks, **not** gated on `!playing`; `role="status"` (polite), not `role="alert"` — a wrong guess is not an emergency |

- **Volunteered speech is gated on `!playing`**: the practice status line and the
  analyzing spinner. Instead of a volunteered position during playback: an on-demand
  "where am I", and full keyboard navigation of the chart when stopped.
- **Answers are never gated on `!playing`**, and default to `role="status"` (polite)
  rather than `role="alert"` (assertive) unless the message is a genuine error the user
  must not miss (see `Field`'s form-validation error, which stays `alert` — rare,
  user-initiated, and something they cannot be allowed to miss).
- **The chart is a semantic sequence**, not a pile of divs. Keyboard-navigable, each cell
  announcing e.g. *"bar 3, beat 1, A minor, 2 beats."*
- **Chord cells are real focusable buttons.** This is load-bearing — it is the condition
  that makes the drag-resize scope cut safe (below).
- **The scrubber is a real slider** with `aria-valuetext` **in musical terms** — *"bar 12,
  beat 2"*, not *"87 seconds"*.
- **Panels move focus in on open and return it on close.**
- **`color-scheme` declared**, so native controls stop rendering light against a dark UI.

### Why practice mode deserves this

Practice mode is an **ear-training quiz**. A low-vision or blind musician is a completely
plausible — and currently underserved — user of exactly that feature. This is not charity
work; it is a feature that happens to fit.

## Scope

### In scope

- Token layer (colour, spacing, radius, type, shadow, fonts) — light and dark.
- Theme toggle: user-controlled, `prefers-color-scheme` default, persisted.
- Primitives: `Button`, `Card`, `Field`, `Panel`, layout wrapper.
- Figtree, self-hosted, with a real type scale.
- Elimination of every inline `style={{...}}` object **carrying colour, spacing, radius,
  border, shadow, font, or static layout** — this is the load-bearing wall. A
  `style={{ background: "#26303f" }}` cannot respond to a theme. Under a single-theme
  redesign this was optional; under two themes it is not.

  **Inline style remains legitimate for runtime-computed geometry**, and those uses stay:
  `Timeline.tsx:174` sets `flex: ${beats} 1 0` from the chord's beat count, and
  `Timeline.tsx:220` / `ScrubBar.tsx:102` carry the playhead transform that
  `chordProgress.ts` drives. Those are data, not design values.
- The three-zone chart page; docked side panel; revived `ScrubBar`.
- Practice mode's spotlight treatment (theme-independent).
- Motion: the current-chord lift, the reveal-as-reward.
- Accessibility: contrast, colour channels, semantic chart, keyboard nav, focus management,
  musical `aria-valuetext`, `color-scheme`.
- Restyle of all five screens: guest home, library, chart editor, login, register.
- **Chord-quality colour** (majors/minors/sevenths reading differently at a glance) — the
  last item in, and **the first item to drop** if it cannot pass AA contrast in both themes.
  Governed absolutely by the hue rule: it is supplementary to the chord's own label, never
  the sole carrier of anything.

### Out of scope — deliberately

- **Drag-to-resize gets zero investment** — neither visual polish nor keyboard/screen-reader
  support. The feature may be cut from the app entirely, so engineering time spent on it may
  be wasted. The restyle still passes over `Timeline.tsx` (that file *is* the chart), but the
  handles keep working exactly as they are and get no tests.

  **This cut is safe, and here is why:** `SegmentEditor.tsx:107-116` already exposes a
  **Beats** number input (`step="0.5"`, `min="0.5"`) that routes through the *same*
  `redistributeLength` path the drag handles use. A keyboard user resizes a segment by
  focusing that field and pressing arrow-up — it nudges by a half-beat, matching the
  existing snap rule. The drag handles are a **redundant convenience, not the only path to
  the feature.** The one condition that keeps this true is that chord cells must be real
  focusable buttons, which is already in scope.
- **A mobile UI.** Prepared for, not built.
- **Gamification.** No streaks, no scores, no points. If a streak system is a good idea it
  deserves its own conversation and its own spec.
- **New product features of any kind.** This is a visual and structural overhaul of what
  exists.

## Delivery: this is more than one implementation plan

The scope above is too large for a single plan, and shipping it as one change would mean a
long-lived branch touching every component with no safe landing point in between. It
decomposes into four phases. **Each is independently shippable** — the app works and looks
coherent at the end of every one.

**Accessibility is not a phase.** It is built into each one, because retrofitting it is how
it ends up half-done. The audit at the end verifies; it does not implement.

| Phase | Contains | Visible change | Why it can ship alone |
|---|---|---|---|
| **1. Foundation** | Token layer (all six kinds), Figtree + type scale, primitives (`Button`/`Card`/`Field`/`Panel`/layout), theme toggle, and the elimination of all 78 inline style objects. A11y: the primitives get contrast, focus rings, and semantics built in **once**. | The palette warms, the type changes, light mode appears. Layout is unchanged. | Nothing structural moves, so the risk is contained to appearance. This is also the phase that makes every later phase cheap. |
| **2. Chart page structure** | The three zones, the pinned control deck, the docked side panel (replacing the measured-pixel `top`), the `ScrubBar` revival. A11y: chord cells become real focusable buttons; the chart becomes a semantic sequence; the scrubber gets musical `aria-valuetext`. | The chart page is rearranged. | The chart still shows the same information; only where things sit changes. |
| **3. Mode expression** | The receding context bar, practice mode's theme-independent spotlight, the current-chord lift, the reveal-as-reward. A11y: the one-channel "correct" state is fixed; everything sits behind `prefers-reduced-motion`; no *volunteered* speech during playback (answers, e.g. `ChordGuess`'s guess feedback, are unaffected). | The app gains its personality. The two modes finally feel different. | Purely additive on top of a working phase 2. |
| **4. Audit and close** | Full WCAG AA contrast sweep in both themes, keyboard-only walkthrough of all five screens, screen-reader pass on practice mode. Chord-quality colour lands here **if** it passes. | Little to none, by design. | It is a verification phase. If it finds nothing, that is the phase succeeding. |

**Phase 1 is the load-bearing one.** It is also the least glamorous — it ends with the app
looking warmer but structurally identical, which can feel like a lot of work for a repaint.
It is not: it is the phase that turns 78 hand-written style objects into a system that
phases 2–4 can retarget in an afternoon each. Skipping or rushing it means doing it anyway,
later, under a deadline, with three phases of new code piled on top.

Each phase gets its own implementation plan.

## Migration risk: tests that will break

About five assertions read style values directly. Each needs updating, and in two cases the
break is *desirable* — the test was asserting on a fragile mechanism.

| Test | Asserts | Why it breaks |
|---|---|---|
| `chart/Timeline.test.tsx:69-75` | raw `style` string incl. `border-left: 3px solid var(--bar-line)` | Hardcodes border widths **and token names**. Any retokenising or move to a class breaks it. |
| `pages/ChartEditorPage.edit.test.tsx:127` | `editor.style.top !== ""` | Couples to the absolutely-positioned panel. The docked side panel kills this — **good riddance; it tested the mechanism, not the behaviour.** |
| `practice/ChordGuess.test.tsx:47-51` | `className` matches `/chord-guess--wrong/` | Class rename. |
| `pages/ChartEditorPage.practice.test.tsx:97` | `className` matches `/shake/` | Class rename. |

**Lower risk, leave alone:** the transform/transition assertions in `chart/chordProgress.test.ts:20-58`,
`chart/Timeline.test.tsx:61,89-120`, and `chart/ScrubBar.test.tsx:42-61` test the *animation
logic*, not appearance. They survive a colour/spacing restyle and should keep passing —
they are the guard rail protecting the GPU-transition scheme we are building on.

## Definition of done

Per `CLAUDE.md`:

- `cd frontend && npm test` passes (Vitest).
- `cd frontend && npm run build` passes (`tsc -b` type-check).
- New behaviour has colocated `*.test.tsx` tests.
- No regression of open items in `docs/TODO.md`.

Plus, specific to this work:

- Every colour pair contrast-checked at WCAG AA **in both themes**.
- No `style={{...}}` object remains in a UI component carrying colour, spacing, or layout.
- Keyboard-only walkthrough of every screen completes without a trap.
