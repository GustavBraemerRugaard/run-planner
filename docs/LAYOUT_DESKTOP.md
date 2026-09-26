# Desktop / tablet layout (≥1000px)

Covers the layout at and above the app's one desktop breakpoint (`min-width: 1000px` in `styles.css`).
Below that width, see `docs/LAYOUT_MOBILE.md` instead — several of these objects don't just shrink,
they restructure or disappear (e.g. the today-card becomes its own tab). Read `docs/ARCHITECTURE.md`
first for tokens/shared patterns referenced here (`--sp-*`, card shell, segmented toggle, etc.).

All measurements below are current, empirically-verified values (via Playwright, at a 1280×1400
viewport with realistic mock data) as of the most recent round of layout work — treat them as the
current intended state, not approximations.

## Page shell

- `.app` — `max-width: 1200px`, centered (`margin: 0 auto`), `12px` padding all around. Everything in
  the app lives inside this one centered column.
- `.topbar` — a CSS grid, `1fr 300px` at this breakpoint (matching `main`'s own two-column split below
  it, so the topbar's right edge lands flush with the side-rail widgets' right edge). Left cell: the
  `<h1>Run Planner</h1>` title (uppercase, letter-spaced, 1.25rem). Right cell: `.topbar-actions`, a
  flex container holding one `.topbar-action-group`.
- `.topbar-action-group` — the single segmented toolbar containing, left to right: GoogleButton ("G"),
  StravaButton ("S", omitted entirely if Strava isn't configured), "+" (add run, primary/filled while
  signed in), "⟳" (refresh, spinner icon while loading). One bordered pill, `1px solid var(--border)`,
  `2px` radius, each segment `flex: 1` so the whole group always spans the full 300px column width, a
  `1px` left-border between segments (none on the first). This is deliberately icon-only/compact — see
  `docs/ARCHITECTURE.md`'s segmented-toggle note for why this shape was chosen over separate buttons.
- Notice banners (`.notice` — setup-needed / Strava-not-configured / error / "sign in" prompt) are full
  width, `10px 14px` padding, a tinted background (`color-mix` over `--accent` or `--danger`), stacked
  with `12px` margin-bottom, appearing above everything else in document order.

## Today card (desktop: a fixed top strip, always visible)

`.section-today` → `TodayCard`. On desktop this renders as a single wide strip directly under the
topbar/notices, `margin-bottom: var(--sp-4)` (16px) below it before the two-column `main` begins. It is
*not* one of the mobile tabs here — it's simply always on screen. Internals (same at every breakpoint):
card shell (`.today-card`, `--sp-3` padding, `--sp-3` gap grid), a clickable "today" line (colored dot +
run name + sub-label, or "No run planned today"), then a "This week" section: total km (with either a
goal comparison or a "vs. last week ▲/▼" trend), a thin progress bar (`.bar`, 10px tall, filled with
`ACTUAL_COLOR`), and a "Set/Edit goal" button that swaps the row for a small km-input + Save/Clear.

## Main two-column layout

`main` is a CSS grid, `grid-template-columns: 1fr 300px` at this breakpoint, `align-items: stretch`
(the calendar column and the side rail are stretched to the same overall row height), `16px` gap
between the two columns. Left column: `.cal-col` (calendar + weekly history). Right column: `.side`
(latest run / active week / weekly average / mileage chart).

### Left column — `.cal-col`

A CSS grid, `16px` gap, containing exactly two boxes stacked vertically:

1. **`.cal`** — the calendar card (card shell). Contains, top to bottom:
   - `.cal-toolbar` — flex row, `space-between`: `<h2>Calendar</h2>` (small, bold, uppercase) on the
     left; on the right, a "Today" button (jumps the calendar back to center on today) and a
     `.view-toggle` segmented pair (**Month** / **List**) switching between `RollingCalendar` and
     `ListView`.
   - The active view itself (see below), `472px` tall at this breakpoint (`.rolling-cal`,
     `.list-view`'s `max-height`).
   - This whole `.cal` box's *rendered height* is measured in `App.tsx` via `ResizeObserver` +
     `matchMedia('(min-width: 1000px)')` and stored as `calHeight` — this number drives the side
     rail's sizing (see `.side-top` below). **Do not remove this measurement** without also revisiting
     the side-rail sizing logic that depends on it.
2. **`WeeklyHistoryList`** (`.week-history`, card shell) — directly below `.cal`, same `16px` gap.
   Title "Weekly history", then `.week-history-list` — a scrollable (`max-height: 254px`, no visible
   scrollbar), `8px`-gapped grid of the last 12 weeks (always 12 rows, oldest data padded with
   zero-value rows rather than omitted — always the same list length). Each `.week-history-row` is one
   CSS grid with fixed column widths (`1fr 50px 84px 104px 90px 76px`): date range (+ "This week" badge
   on the current week, and an accent border on that row) | runs | km (+ trend arrow) | time (+ trend
   arrow) | pace (+ trend arrow) | bpm (+ trend arrow). All rows share these exact column widths so
   every metric lines up vertically week to week — a new column must be added to *all* rows, never one.
   - **254px is a deliberately tuned value**, not arbitrary: it was specifically reduced (from showing
     more rows at a glance) so the mileage chart beside it — which mirrors this list's own rendered
     height — would also shrink to match. If you resize this list, the mileage chart's height changes
     too automatically (see below); that coupling is intentional, not a side effect to "fix".

### Right column — `.side`

A flex column (`display: flex; flex-direction: column`) containing exactly two things, `16px` gap
between them:

1. **`.side-top`** — a flex column (also `16px`/`--sp-4` internal gap) holding, in order:
   `LatestRunCard` → `ActiveWeekCard` → `AverageStatsCard`. Its height is set explicitly, in pixels, via
   inline style from `App.tsx`'s `calHeight` (i.e. it is forced to exactly match `.cal`'s own rendered
   height — *not* the whole `.cal-col`, just the `.cal` box). Only the **last** child (`AverageStatsCard`)
   is given `flex: 1 1 auto`, so it alone absorbs whatever slack is needed to reach that exact height;
   the gaps between all three cards stay the app's one standard `16px`, and the last card's own bottom
   border still lands exactly flush with `.cal`'s bottom edge (its box just gets a little taller, with
   a little empty room below its own content, rather than the gap growing). **This exact mechanism —
   fixed 16px gaps + only-the-last-item grows — was arrived at after two rounds of back-and-forth**
   (space-between-with-uneven-gaps was tried and rejected as inconsistent spacing; flex-start-with-
   trailing-slack was tried and rejected because the last card's own edge didn't reach the calendar's
   bottom). Don't reintroduce either of those alternatives without a fresh, specific reason. If
   `.side-top`'s natural content overflows the pinned height anyway, it scrolls internally
   (`overflow-y: auto`) rather than pushing the chart down.
2. **`MileageChart`** (`.chart-card`, card shell) — `flex: 1 1 auto`, so it absorbs the *entire*
   remaining height of `.side` after `.side-top`'s pinned height is subtracted. Because `.side` itself
   is stretched (via `main`'s `align-items: stretch`) to match `.cal-col`'s *total* height (`.cal` +
   `.week-history`), and `.side-top` is pinned to exactly `.cal`'s height, the chart mathematically
   ends up exactly `.week-history`'s height too — with no separate arithmetic needed for that; it falls
   out of the two stretch rules combined. If either the calendar's height or the weekly-history list's
   height changes, both the side-top group and the chart resize to match automatically.

#### Latest Run Card (`.latest-run`)

Card shell, `cursor: pointer` (opens `ActivityDetail` for that activity). Header row: "Latest run"
title (left) + the run's date (right, flush with the card's own right edge). Run name below. Then
`.latest-run-stats`: **always exactly 5 metric slots** (km, time, /km pace, bpm, spm), each rendered
even when a given activity lacks that data (shown as "—") — spaced with `justify-content:
space-between` over their natural widths, not an equal-width grid, so the last slot's right edge lands
flush with the date above it. If there's no Strava activity at all yet, the whole stats block is
replaced by a single "No Strava runs found yet." line — but the title and card shape stay the same.

#### Active Week Card (`.active-week`)

Card shell. Shows whichever week is currently browsed/centered in the calendar above (today's week by
default; a different week while scrolled elsewhere in `RollingCalendar`/`ListView`, via
`onVisibleWeekChange`). Contents, top to bottom:

- Header (`.active-week-head`): date range (e.g. "21 Sep – 27 Sep") on the left, total km on the right,
  `space-between`.
- `.bar` (10px tall segmented bar): actual (orange) + planned-by-type segments, proportioned by km.
- `.summary-sub`: "`N` runs" + optionally "· `X` km still planned" if the week isn't over/fully run yet.
- **Training-load (ACWR) block** (`.training-load`, `--sp-3` top margin/padding, top border divider):
  - Header row: "Training load" label + the zone label (Low load / On track / Elevated / High risk /
    **Not enough data**), colored by zone (`--muted`/`--success`/`--warning`/`--danger` respectively).
  - A 4-segment horizontal gauge bar (8px tall, `2px` radius, widths proportioned to the 0.8/1.3/1.5/2.0
    zone boundaries) with a vertical marker line at the current ACWR value (capped at 2.0). When there
    isn't yet enough training history for a ratio, the whole gauge renders as one flat neutral grey bar
    (all 4 segments in the "low" color) instead of the colored zones — same shape, neutral state, never
    omitted.
  - A hint line below the gauge: `"ACWR X.XX · <short zone-specific sentence>"`, or the neutral-state
    sentence "Not enough history yet for a ratio." when there's no ratio yet.

  **This card is explicitly designed to be a fixed size regardless of which week is being browsed or
  how much training history exists** — this was a specific fix, not an accident: the training-load
  block is *always* rendered (never conditionally shown/hidden based on data availability — the
  no-data state reuses the exact same DOM shape with neutral content instead), and the hint line has a
  CSS `min-height` reserving room for 2 lines (`.training-load-hint { min-height: calc(2 * 1.2em); }`)
  because different zones' hint text wraps to different numbers of lines otherwise. The zone hint copy
  was deliberately kept short specifically so none of it exceeds 2 lines at this card's ~276px content
  width — **if you ever need to edit this copy, re-verify (e.g. with a quick Playwright measurement)
  that the new text still fits within 2 lines here**, or the card will start resizing between weeks
  again, which is exactly the bug this was built to prevent. There is no visible "as of <date>" text
  even though the underlying ratio *is* computed as-of whichever date is relevant (today, if the
  browsed week is the current week; otherwise that week's last day) — this text was explicitly removed
  per user request; the date-dependence is real and intentional, just not displayed.

#### Weekly Average Card (`.avg-stats`)

Card shell. Header: "Weekly average" + a 2-option segmented toggle (**4w** / **12w**). Below: 4 stat
rows (Runs, Distance, Time, Avg. pace), each `space-between` (label left, bold value right). This is
the side-top group's *last* child, so it's the one that absorbs the height-matching slack described
above — expect it to sometimes have a little extra blank room below its 4 rows; that's intentional
flex-grow behavior, not a bug.

#### Mileage Chart (`.chart-card`)

Card shell, `flex: 1 1 auto` (see above for how its height is determined). Contents:

- `.chart-head`: "Weekly mileage" title + a `weeks-input` stepper on the right (− / count / +, 4–52
  weeks, default from `DEFAULT_CHART_WEEKS` in `config.ts`).
- `.chart-plot` (`flex: 1 1 auto`, so it fills whatever vertical room the card has): dashed gridlines at
  25/50/75/100% of the max value in view, each labeled with its km value in a **52px-wide right gutter**
  reserved specifically so labels never crowd the tallest (rightmost/current) bar. Bars
  (`.chart-bar-col`, `flex: 1`, 2px gap between columns) are stacked-segment bars: for a past week,
  actual (orange) below planned-by-type segments; the *current* week's bar gets a `2px` accent-colored
  outline border (`.chart-bar.current`) to mark it as "in progress."
- `.chart-x-axis` — one label column per bar, sharing the exact same 52px right gutter and 2px gap as
  the bars above so each label lines up under its own bar. **Labels are rotated 90°**
  (`writing-mode: vertical-rl; transform: rotate(180deg)`) specifically so each one only needs about
  one character's width rather than a whole "27/9"-wide horizontal string — this was a deliberate fix
  for label overlap in this ~276px-wide column, replacing an earlier horizontal, thinned-out-labels
  approach. Each label is the week's **end date** (Sunday, since weeks start Monday), formatted `d/m`.
  Up to `MAX_X_LABELS` (currently 16) get a label; beyond that count, labels thin out to evenly-spaced
  indices (always covering the oldest and current week) rather than rendering one under every bar. If
  you ever revisit this rotation or the label cap, re-verify with the same width constraint in mind —
  the whole point was fitting many legible per-week labels into a narrow side-panel column.

## Modals (both, at ≥900px)

Both popups — `RunForm` (create/edit) and `ActivityDetail` (view a completed run) — share **one
"standard" box size** at this breakpoint: `max-width: 860px`, and a height that RunForm measures from
its own natural content and both popups then use (`lib/modalSize.ts`, sessionStorage-backed, since the
two popups are never mounted at the same time). This was a deliberate fix for a real CSS bug (see
`docs/ARCHITECTURE.md`'s note on `align-items: normal` computing to `stretch`) plus a real design
requirement ("all popups should be the exact same height and width") — **do not let one popup's size
independently drift from the other's** when changing either one's content; re-measure/re-verify both
still match (they were last verified pixel-identical at 860×669).

- **RunForm** (`.modal-wrap`, `flex-direction: row` at this breakpoint): two side-by-side panels.
  - Left: `.modal` (the actual form, `flex: 1 1 480px; max-width: 480px`) — type chips, date field,
    warm-up/main/cool-down step editors, computed totals, auto-generated calendar title (read-only),
    editable description, and Delete/Cancel/Save actions. `align-items: flex-start` on `.modal-wrap` is
    load-bearing here (see the architecture doc) — without it the form silently stretches to match the
    context panel's height, leaving dead space below its buttons.
  - Right: `RunContextPanel` (`.form-context`, `flex: 1 1 320px`) — read-only: this week's total + 7-day
    rolling total, this week's run-type mix (mini bars), and day-by-day rows for the previous and
    current week (each entry a colored dot + label + km, "(editing)" tag on the draft being edited).
    Its `max-height` is set in JS to exactly match the form panel's measured height, scrolling
    internally if its own content is taller — the two panels always end at the same bottom edge, with
    no visible scrollbar handle (see `docs/ARCHITECTURE.md`'s "no scrollbar handles, anywhere" rule —
    applies here same as everywhere else in the app).
- **ActivityDetail** (`.modal-wrap.single`, one panel, `max-width: 860px`): activity name/date header,
  a totals row (same equal-gap-spread pattern as LatestRunCard), pace and HR lap-by-lap bar charts
  (`LapChart` — bar width proportional to lap distance, y-axis auto-scaled with padding so no bar
  touches the plot edge, x-axis in km), then a full laps table, then a Close button. Its `.modal`
  height is forced (via `modalSize.ts`) to the shared standard height regardless of how many laps this
  particular activity has, scrolling internally (`overflow-y: auto`) if it's a longer run.
