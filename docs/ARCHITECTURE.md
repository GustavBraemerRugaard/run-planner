# Run Planner — Architecture & Design Reference

This is the living reference for how Run Planner is built and why it looks the way it does. It exists
so that changes to the app stay consistent with decisions already made, instead of quietly drifting or
undoing something the user asked for in an earlier round of feedback.

**How to use this doc set, as an assistant working on this codebase:**

1. Before making a UI/layout change, read this file plus whichever of `docs/LAYOUT_DESKTOP.md` /
   `docs/LAYOUT_MOBILE.md` covers the breakpoint you're touching. Check whether the thing you're about
   to change is described here — if so, treat the existing description as an intentional decision
   (often the result of an earlier, explicit user request), not an accident to "fix" incidentally.
2. When a request only asks for one specific change, don't let unrelated documented behavior drift.
   E.g. if asked to change the mileage chart's axis labels, don't change the side-panel spacing rule
   documented alongside it, even if it looks related.
3. After making a change, update the relevant section of these docs in the same round of work — new
   components, new CSS classes/rules, new breakpoints, changed dimensions, changed rationale. Treat an
   undocumented change as an incomplete change. Keep the "why" (the comment-like rationale), not just
   the "what" — the rationale is what future changes need to respect.
4. If a request conflicts with something documented here, that's worth surfacing (briefly) rather than
   silently overriding — the doc may capture an earlier explicit decision the user has forgotten about.

These docs describe **desktop** (`docs/LAYOUT_DESKTOP.md`) and **mobile/phone** (`docs/LAYOUT_MOBILE.md`)
presentation separately, because the app is not just "desktop squeezed narrower" — several objects are
restructured, resized, or replaced entirely between the two (the today-card becomes its own tab, the
calendar shrinks, the modal becomes a bottom sheet, etc.). Shared foundations (tokens, tech stack, data
model, file map) live in this file so they aren't repeated twice.

## Purpose of the app

A personal, free running-training planner: plan structured runs on a Google Calendar ("Løb" calendar),
see them alongside actually-completed Strava runs, and track trends (weekly mileage, training load,
personal averages) — all in one page, without a backend server. It's built for one user (Gustav), not
as a multi-tenant product, so some choices (e.g. localStorage-only goals, no user accounts) are
deliberate simplifications, not oversights.

## Tech stack

- React 19 + TypeScript, built with Vite, deployed as a static SPA to GitHub Pages.
- No backend of its own. Two external APIs, both called directly from the browser:
  - **Google Calendar API v3** — the source of truth for planned runs. Each planned run is one all-day
    calendar event on a dedicated "Løb" calendar, with the structured workout data (steps, run type)
    packed into `extendedProperties.private` so a plain calendar view still shows something sensible.
  - **Strava API** — the source of completed-run data (distance, time, pace, HR, cadence, laps, and the
    detailed per-sample time series — see "Streams" below). Strava's OAuth flow requires a confidential
    client secret, which can't live in a static site, so token exchange/refresh is proxied through a
    small Cloudflare Worker (`worker/`); the browser never holds the Strava client secret.
- **Streams (`getActivityStreams` in `lib/strava.ts`)** — Strava's `/activities/{id}/streams` endpoint,
  the device-resolution (~1Hz) time/distance/heartrate/velocity series a GPS watch actually recorded,
  resampled here into fixed ~10s buckets (`STREAM_BUCKET_SEC`) by averaging every raw sample in each
  window. This is the data source for the default pace/HR detail view (`StreamChart.tsx`). The ~10s
  bucket width, and the further 30s trailing rolling average `StreamChart` applies on top of it
  (`lib/streamMath.ts`), were picked by building a live side-by-side comparison (today's lap-average
  view vs. several raw/smoothed stream resolutions) and asking which read best, not guessed upfront.
  Missing `heartrate` (e.g. no HR strap that run) leaves that field `null` per-point rather than failing
  the whole fetch. `latlng` is never requested — there's no map or route visualization in the app (see
  below), so fetching position data would be pure overhead.
- No basemap, mapping library, or route visualization of any kind — an activity's detail view is pace/HR
  data only. A Leaflet + OpenStreetMap-tiles route map was tried and dropped as "too detailed"; a
  follow-up custom SVG route line colored by a pace/HR gradient (no basemap) was tried next and also
  dropped, unrelated to the detail level — the route just isn't part of what this view is for. No
  dependency beyond React as a result.
- Google sign-in uses Google Identity Services' implicit token flow; the access token is kept only in
  memory (not localStorage), so a page reload requires signing in again — a deliberate trade-off to
  keep the token out of reach of any injected script.
- Per-week distance goals are the one piece of state that lives only in the browser (`localStorage`,
  see `src/lib/goals.ts`) — there's no server to sync them to, and they're a personal target, not data
  that needs to leave the device.

## File map

```
src/
  main.tsx                 — entry point
  App.tsx                  — top-level layout, all cross-cutting state, data loading
  config.ts                — user-editable constants (client IDs, calendar ID, FIRST_DAY, etc.)
  styles.css               — the entire app's CSS (no CSS-in-JS, no component-scoped stylesheets)
  domain/run.ts            — the domain layer: Run/Step/RunType shape, calendar<->domain mapping,
                              week-summary math, formatting helpers, training-load (ACWR) computation
  lib/
    auth.ts                — Google sign-in (token lives in memory only)
    calendar.ts             — thin Google Calendar API v3 client
    strava.ts               — Strava OAuth (via the Cloudflare Worker), activities, laps, personal
                              bests, detailed streams (`getActivityStreams` — see "Streams" above)
    streamMath.ts             — `trailingRollingAverage`, StreamChart's 30s-window smoothing pass
    chartMath.ts              — axis/tick helpers (`floorToStep`, `ceilToStep`, `evenTicks`,
                              `niceKmStep`) shared by LapChart and StreamChart
    goals.ts                — per-week goal, localStorage-only
    modalSize.ts             — sessionStorage-based "standard modal height" shared between popups
  components/
    RollingCalendar.tsx     — desktop/tablet month-grid calendar view (see layout docs)
    ListView.tsx            — flat chronological list calendar view (the other view-toggle option)
    TodayCard.tsx           — "today + this week" summary (desktop top strip / mobile "Today" tab)
    LatestRunCard.tsx       — side-panel: most recent Strava run
    ActiveWeekCard.tsx      — side-panel: the calendar's currently-browsed week + training load (ACWR)
    AverageStatsCard.tsx    — side-panel: weekly averages over last 4 or 12 weeks
    HistoryList.tsx         — below the calendar: scrollable list of the last 12 weeks/months (togglable),
                              actual data
    MileageChart.tsx        — side-panel: weekly mileage bar chart with rotated date labels
    RunForm.tsx             — create/edit-run modal (the form half of the two-panel popup)
    RunContextPanel.tsx     — create/edit-run modal (the context half — surrounding week's runs +
                              a training-load preview for the run being edited)
    TrainingLoadGauge.tsx   — the ACWR zone/gauge/hint visual, shared by ActiveWeekCard and
                              RunContextPanel so "how risky is this load" never diverges between them
    ActivityDetail.tsx      — view-a-completed-run modal (streams/laps pace+HR charts, no route/map)
    StreamChart.tsx          — the default pace/HR view: a continuous line through every ~10s-bucketed,
                              30s-rolling-averaged stream sample, with hover crosshair/tooltip
    StepEditor.tsx          — one warm-up/main/cool-down step row inside RunForm
    DateField.tsx           — dd/mm/yyyy masked date input + native picker button
    GoogleButton.tsx        — topbar connect/disconnect segment for Google
    StravaButton.tsx        — topbar connect/disconnect segment for Strava
worker/                     — Cloudflare Worker: Strava OAuth token exchange/refresh proxy
docs/                       — this documentation set
```

## Domain model (brief)

- A **Run** (planned) is always an all-day Google Calendar event on the Løb calendar, made of one or
  more **Steps** (`warmup` | `main` | `cooldown`); total distance/pace are always *derived* from steps,
  never entered directly, so the calendar title and stats can't drift from the actual workout plan.
- **RunType** — `easy | tempo | long | intervals | race` — each with a fixed pastel color + text color
  (`RUN_TYPES` in `domain/run.ts`) used consistently everywhere a planned run is shown as a colored
  chip/pill/segment (calendar pills, chart segments, form-context timeline cells, bar chart, etc.).
- **Completed runs** (Strava activities) are always shown in one fixed color (`ACTUAL_COLOR = #f97316`,
  orange), distinct from every planned-run color, so "done" vs "planned" is always visually obvious
  regardless of run type.
- **Training load (ACWR)** — acute:chronic workload ratio, EWMA-smoothed (7-day acute / 28-day chronic,
  Foster's session-RPE-style load), classified into 4 zones (low / optimal / elevated / high) at
  Gabbett (2016) thresholds (0.8 / 1.3 / 1.5). See `computeTrainingLoad` in `domain/run.ts`, the shared
  `TrainingLoadGauge` component for how the zone/gauge/hint is presented (used by both `ActiveWeekCard`,
  for the currently-browsed week's actual load, and `RunContextPanel`, for what the run being edited
  would do to that load if saved — via `overlayDraftRun`, which folds the draft into `dayEntries` in
  place of its own saved copy before computing), and the Active Week card / RunForm sections in the
  layout docs for how each is presented.

## Design tokens (`:root` in `styles.css`)

All colors are CSS custom properties with a `prefers-color-scheme: dark` override block — **never
hardcode a color that should adapt to dark mode**; use the token.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bg` | `#f8fafc` | `#0b1220` | page background |
| `--panel` | `#ffffff` | `#111a2e` | card/panel background |
| `--text` | `#0f172a` | `#e5edf9` | primary text |
| `--muted` | `#64748b` | `#94a3b8` | secondary text, labels |
| `--border` | `#e2e8f0` | `#22304d` | all hairline borders/dividers |
| `--accent` | `#0284c7` | `#38bdf8` | active/selected state, links, "today" highlight |
| `--accent-text` | `#ffffff` | `#06202f` | text on top of `--accent` |
| `--danger` | `#dc2626` | `#f87171` | delete actions, errors, "high" training-load zone |
| `--warning` | `#d97706` | `#fbbf24` | "elevated" training-load zone |
| `--success` | `#16a34a` | `#4ade80` | "optimal" training-load zone |
| `--radius` | `2px` | — | the one corner radius used almost everywhere ("Technical Mono" look — sharp, not rounded) |

Spacing scale (`--sp-1`..`--sp-5` = 4/8/12/16/24px) — **use these instead of ad hoc px values** for new
layout rules; `--sp-4` (16px) is the app's one "standard gap" used between the topbar and content,
between side-panel cards, etc. — several rounds of feedback have specifically asked for this to stay
*consistent* across the app, so don't introduce a different gap value for "just this one spot" without
a specific reason.

Type scale (`--fs-micro` 0.68rem / `--fs-caption` 0.75rem / `--fs-label` 0.8rem / `--fs-value` 0.95rem /
`--fs-value-lg` 1.05rem) — the same kind of text (a field label, a caption under a stat, a headline
number) is always the same size everywhere; don't pick a new close-but-different rem value for a new
widget when an existing token already means the same thing.

## Shared visual language (cross-platform, applies at every breakpoint)

- **"Technical Mono" aesthetic**: monospace font stack everywhere, `--radius: 2px` corners (sharp, not
  rounded pills), section titles are small, bold, uppercase, letter-spaced (`.label.title`,
  `.cal-title`, modal `<h2>`). This is a deliberate stylistic choice, not a default left un-styled.
- **Card shape**: every top-level panel/card (`.cal`, `.active-week`, `.chart-card`, `.avg-stats`,
  `.latest-run`, `.week-history`, `.today-card`) shares the same shell — `var(--panel)` background,
  `1px solid var(--border)`, `var(--radius)` corners, ~12px padding (`--sp-3`) — so any new card-like
  widget should reuse this shell rather than inventing new border/padding values.
- **Segmented toggle** (`.seg-toggle`, `.view-toggle`, `.avg-stats-toggle`, `.topbar-action-group`,
  `StepEditor`'s `ToggleGroup`): the app's one visual stand-in for a `<select>` dropdown — a row of
  buttons in a single bordered, overflow-hidden pill, active segment filled with `--accent`. Used for
  every "pick one of a few options" control in the app. A new option-picker control should reuse this
  pattern rather than introducing a native `<select>` or a different toggle style.
- **Planned vs. actual**: a planned run is always colored by its `RunType` (pastel bg + matching dark
  text); a completed (Strava) run is always the fixed orange `ACTUAL_COLOR`. This distinction is drawn
  everywhere a run appears (calendar pills, list entries, bar/chart segments, form-context timeline
  cells) — never invert or blend this convention for a new surface.
- **Equal-gap-spread over equal-width-grid** for a row of natural-width stats (`.latest-run-stats`,
  `.activity-totals`, `.today-week-total`, `.topbar` vs. the 300px side rail): `justify-content:
  space-between` over naturally-sized items, so the *last* item's own right edge lands flush with the
  container's right edge — not an equal-width grid, which would leave left-aligned text short of the
  edge. Reuse this trick for new "a few stats in a row" widgets.
- **Always-render-all-slots-with-a-placeholder**: widgets that have several potential values per run
  (LatestRunCard's 5 metric slots, HistoryList's 5 stat columns, ActiveWeekCard's training-load
  block) always render every slot, using "—" or a neutral fallback state for missing data, rather than
  conditionally omitting a slot. This exists specifically so a card's size and layout stay constant
  regardless of which particular data happens to be available for the thing it's currently showing —
  see `docs/LAYOUT_DESKTOP.md`'s Active Week Card section for the fullest example of why this matters
  (a card that resizes as you browse between weeks reads as broken/jittery).
- **Height-matching via JS + ResizeObserver + matchMedia**, not CSS alone: several places measure one
  element's actual rendered height and apply it as a sibling's explicit height (side-top ↔ calendar box;
  RunForm ↔ RunContextPanel; the shared "standard modal height" in `modalSize.ts` between RunForm and
  ActivityDetail). CSS `align-items: stretch` cannot be used for these because a stretched sibling's
  *own* border would land in the wrong place (see the `align-items: normal` computes to `stretch`, not
  `flex-start`, gotcha documented inline in `styles.css` above `.modal-wrap`'s `≥900px` rule) — always
  gate this kind of JS sizing behind the same `matchMedia` breakpoint used by the corresponding CSS
  rule, and disable it (pass `undefined`) below that breakpoint so mobile's natural, content-sized
  stacking isn't overridden. **Apply the measured number as `height`, not only `max-height`** — `max-
  height` alone only caps a box, it doesn't force a box whose own content is *shorter* than that cap to
  grow and fill it, so if the shorter side's content ever gets less tall (as happened when
  `RunContextPanel`'s old day-list design was replaced with the more compact timeline), the two sides
  silently stop lining up at the bottom again despite the "matching" code still running unchanged. Set
  both `height` and `max-height` to the measured value (the latter kept only as a redundant safety net,
  e.g. against a viewport shorter than the measured number) and keep `overflow-y: auto` for the case
  where content ends up taller than the fixed height instead.
  **`RunForm` deliberately does not use a `ResizeObserver` on itself**, unlike the other cases here
  (side-top ↔ calendar box does, since the calendar's height legitimately can change and should be
  tracked) — a `ResizeObserver` on the form would fire every time the form's *own* content changes size
  (adding/removing a step, toggling warm-up/cool-down), which is exactly the "box visibly grows while
  you're mid-edit" behavior that was reported as a bug and fixed. Instead `RunForm` measures once on
  mount plus on a plain `window resize` listener and the `matchMedia` breakpoint's `change` event only —
  deliberately blind to its own content's size changes, so the measured/locked height only ever changes
  for a reason unrelated to what you're currently typing into the form.
- **Hover interaction — every clickable element reacts** (an explicit, standing requirement): hovering
  any clickable thing in the app gives a subtle visual reaction, so the cursor's target is always
  obvious before you click. Three treatments, picked by the element's shape, not a single one-size-fits
  all rule (validated as a live comparison demo — scale-only, border/ring-only, and combined — before
  implementation; "combined" was chosen):
  - **Standalone bordered elements** (`.btn` and its variants, `.date-field-pick`, cards like
    `.latest-run`, row-cards like `.list-entry`/`.week-history-row`): `transform: scale(1.03–1.045)`
    (smaller — `1.02–1.03` — for large cards or tightly-stacked rows with only a few px of gap, so the
    scale doesn't visibly overlap a neighbor) plus `border-color: var(--accent)` and
    `box-shadow: 0 0 0 1px var(--accent)`. `.btn.primary` has no visible border of its own (filled with
    `--accent`, `border-color: transparent`), so its ring uses `--accent-text` instead, for contrast
    against its own fill rather than changing a border nobody can see.
  - **Borderless colored elements**: `.chip` (already carries its own `RunType` color as a border) adds
    scale plus a background tint of `--accent` (not its own type color, which stays as the identity
    signal) — the already-`.active` chip gets a `filter: brightness(1.08)` instead, since a competing
    tint would fight the fill. `.pill` (no border at all) adds scale plus a `box-shadow` ring instead of
    a `border-color` change. `.step-remove` (small icon-only button) adds scale plus a tint of its own
    existing hover color (`--danger`, already established before this pattern existed) rather than the
    app accent, since red is already this control's own hover signal.
  - **Flush / shared-border groups, where a scale would clip into a neighbor and break the seamless
    edge** — every segmented-toggle instance (`.seg-toggle`, `.view-toggle`, `.avg-stats-toggle`,
    `.week-history-toggle`, `.weeks-stepper`, `.mobile-tabbar`, `.topbar-action-group`) plus the flush
    calendar grid (`.rolling-day`, which shares a `border-right` with its neighbor): an **inset** ring
    (`box-shadow: inset 0 0 0 1px var(--accent)`) plus a background tint
    (`color-mix(in srgb, var(--accent) 16%, <the element's own base background>)`) for an inactive
    segment; the already-filled `.active` segment gets `filter: brightness(1.12)` plus an inset ring in
    `--accent-text` instead of a competing tint. No `transform` anywhere in this group.
  - **Borderless full-width rows with no natural gutter to scale into** (`.today-line`,
    `.list-day-head`, `.list-entry-empty`): background tint only (`color-mix(in srgb, var(--accent) 8%,
    transparent)`), no scale, no ring — scaling a row that spans its container edge-to-edge has nowhere
    to grow into without visually clipping.
  - `.form-context-cell` (the run-form timeline strip cells) and `.week-history-row` (the history-list
    rows) are deliberately **excluded** — both are plain, non-interactive display rows with no
    `onClick` (`.form-context-cell` only has a hover tooltip; `.week-history-row` has nothing at all —
    only the `.week-history-toggle` buttons above it are actually clickable), so neither counts as a
    clickable element for this rule.
  - **A hover effect needs clearance to render into, or its ancestor's scroll clipping cuts it off**:
    `.side-top` (which holds `.latest-run`, the only hoverable card in that column) has `overflow-y:
    auto` at the ≥900px breakpoint, and setting `overflow-y` to anything but `visible` forces the
    browser to also clip the x-axis (a lone `overflow-y: auto` + `overflow-x: visible` pairing isn't a
    valid computed combination — the `visible` axis gets coerced to `auto` too), not just scroll the
    y-axis. `.latest-run` is `.side-top`'s first child, flush against every one of its edges with zero
    natural gap, so its hover ring/scale was clipped on the top and both sides — only the bottom
    rendered fully, where the 16px gap to the next card already gave it room. Fixed with two different
    techniques depending on the axis, both on `.side-top`:
    - **Top**: plain `padding-top: 4px`. A few px of extra space above the first card, absorbed from
      the fixed JS-measured height (`box-sizing: border-box`, set globally), with nothing above it to
      misalign with.
    - **Left/right**: plain padding was tried first and rejected — it shifts every card 6px inward from
      the 300px column's own edges, breaking the flush alignment those edges must keep with the topbar
      and the mileage chart card below (see the "Equal-gap-spread" pattern above and
      `docs/LAYOUT_DESKTOP.md`). The actual fix pairs a negative margin with equal padding, horizontal
      only: `margin: 0 -6px; padding: ... 6px` (see the full rule for the exact values). Flexbox
      `stretch` (the default cross-axis alignment `.side-top` inherits from `.side`, a column so the
      cross-axis is horizontal) sizes a stretched item's own visible box to fully cover the space next
      to a negative margin — so the box becomes 6px wider on each side, bleeding harmlessly into the
      column's outer gaps, while the padding pushes the cards back in by that same 6px. Net effect at
      rest: zero shift (verified: the card's bounding box x/width are pixel-identical before and after
      this rule was added). Net effect on hover: 6px of clearance on each side.
    - **Why the same trick doesn't also cover the vertical axis** (i.e. why top/bottom aren't also
      `margin: -6px` / `padding: 6px`, folded into one rule): `.side-top`'s height is the flex *main*
      axis, and it's set directly via inline style (`calHeight`, JS-measured — see App.tsx), not
      stretch-computed. The stretch-absorbs-negative-margin mechanic above is specifically a *cross-axis*
      behavior; applying it to the main axis instead would just shift the whole box up past the column's
      intended top edge (no stretch recalculation to cancel it out), not render harmlessly into a gap.
      That's why vertical clearance is a plain, unmatched `padding-top` rather than reusing this trick.
    Any future hoverable element added flush against a scrolling container's edge needs the same kind of
    clearance — check for this before assuming a missing hover effect is a CSS specificity bug, and
    remember top/bottom and left/right need *different* techniques for the reason above.
  - Transition timing is `120ms ease` on every affected property (`transform`, `border-color`,
    `box-shadow`, `background`, `filter`), added directly on each element's own base rule (not a
    universal `* { transition }`, so unrelated properties never pick up an accidental transition).
    `@media (prefers-reduced-motion: reduce)` disables the transition and forces `transform: none` on
    every scale-based selector at the bottom of `styles.css` — the highlight itself still shows (it's
    the "this is clickable" signal, not decoration), just without the animated motion.
  - Disabled elements never react on hover — every rule here is scoped with `:not(:disabled)` (or
    simply relies on `.today-line`'s existing `cursor: default` styling) so a disabled `.btn`,
    `.today-line`, `.weeks-stepper` button, or `.topbar-action-group` button stays visually inert.
  - **`.list-view` needed the same scroll-clearance fix as `.side-top`** (see above): it's also
    `overflow-y: auto` (hence `overflow-x` coerced to `auto` too) with its rows flush against its left/
    right edges, so a row's hover ring was clipped on both sides. Same technique, horizontal only:
    `padding: 0 10px; margin: 0 -10px;` on `.list-view` itself — net zero shift at rest, 10px of
    clearance on hover.
  - **`.cal-toolbar-actions .btn.small` (the "Today" button) needed a scoped size override** to match
    the height/font-size of the adjacent `Month`/`List` segmented toggle: `font-size: 0.85rem; padding:
    6px 14px;`. Scoped to `.cal-toolbar-actions` rather than changed on `.btn.small` globally, since that
    class is reused elsewhere (`RunForm`'s step buttons, `TodayCard`) at its original size.
- **Hover *data-point* tooltips — a shared, purpose-built design instead of the native browser
  tooltip** (an explicit, standing requirement — distinct from the clickable-hover highlighting above,
  which signals "this reacts to a click"; this is for hovering a non-clickable data point, like a bar
  segment or a lap, to see the number(s) behind it): every such spot used a plain `title=` attribute
  until this pattern was introduced, which meant browser-default styling (delay, plain background, no
  relation to the app's own visual language) at five different sites (`ActiveWeekCard`'s week-mix bar
  segments, `MileageChart`'s bars, `TrainingLoadGauge`'s ACWR explanation, `RunContextPanel`'s day-strip
  cells, `ActivityDetail`'s `LapChart` bars). Three design options (a small technical "chip", a bordered
  card with an accent-colored left edge, and a monospace "terminal readout") were mocked up and shown
  side by side before implementation, per an explicit "show me options first" request; **Option B — the
  bordered card — was chosen.**
  - **Shared CSS, `styles.css`**: `.hovertip-host` (`position: relative`, put on the hoverable element)
    wraps a `.hovertip` child — `position: absolute`, centered above the host (`bottom: calc(100% + 8px);
    left: 50%; transform: translate(-50%, ...)`), styled as a small card: `background: var(--panel)`,
    `border: 1px solid var(--border)` plus a 2px `border-left: var(--accent)` accent edge (the visual
    signature that reads "Option B" at a glance), a drop-shadow, and a small downward caret
    (`.hovertip::after`, a CSS triangle) pointing at the host. Content goes in `.hovertip-row` (a
    space-between key/value line — `.hovertip-key` muted, `.hovertip-value` bold) for structured
    key→number readouts, or a single `.hovertip-text` line for prose (used by `TrainingLoadGauge`'s ACWR
    explanation, which isn't a key/value pair).
  - **CSS-only vs. JS-driven**: four of the five sites are plain HTML, so a pure-CSS
    `:hover`/`:focus-within` opacity+transform transition on `.hovertip-host > .hovertip` is enough —
    no JS state, no event handlers. `ActivityDetail`'s `LapChart` is the exception: its bars are SVG
    `<rect>` elements inside a scaled `viewBox`, where embedding real HTML markup positioned relative to
    one specific bar isn't practical (an absolutely-positioned HTML tooltip doesn't scale/reposition
    with the SVG's own viewBox transform the way an SVG-native element would). So `LapChart` tracks
    `hoverIdx` in React state (`onMouseEnter`/`onMouseLeave` on each `<rect>`) and renders a single
    `.hovertip` positioned by percentage (`left: ${...}%`, computed from the hovered bar's x-position
    against the chart's fixed width) just after the closing `</svg>` tag, with an explicit `.js-shown`
    class standing in for `:hover` — this mirrors `StreamChart`'s pre-existing hover-crosshair/tooltip,
    which has the same SVG-positioning constraint.
  - **`.bar` (the week-mix bar in `ActiveWeekCard`/`RunContextPanel`) had `overflow: hidden`** to round
    its outer corners around the flush `.bar-seg` segments inside it — which would have clipped the new
    per-segment `.hovertip`s exactly like the `.side-top`/`.list-view` scroll-clipping cases above.
    Fixed by removing `overflow: hidden` from `.bar` and moving the corner-rounding onto the segments
    themselves instead (`.bar-seg:first-child`/`:last-child` get the matching `border-radius` corners),
    so the row still reads as one pill-shaped bar at rest with nothing clipping a hover tooltip that
    pokes above it.
  - **`.form-context-cell` (the run-form's 7-column day-strip, `RunContextPanel`) needed 3-zone
    anchoring instead of the default centered tooltip**: the strip is only ~320px wide across 7 cells
    (~40px each), and `.form-context` is itself `overflow-y: auto` (hence x-clipped too, same coercion
    as above) — a centered tooltip on the leftmost or rightmost cells would overflow past the panel's own
    edge and get clipped. Rather than adding clearance padding to the whole panel for this one edge case
    (rejected as visually excessive), the left 3 cells (`:nth-child(-n+3)`) anchor the tooltip's *left*
    edge to the cell's left edge, the right 3 (`:nth-child(n+5)`) anchor *right*, and the middle (4th)
    cell keeps the default centered anchor. Edge-anchored tooltips drop the caret (`::after { display:
    none; }`) since a centered-pointing triangle would misleadingly point away from the tooltip's actual
    anchor once it's no longer centered over the cell. This doesn't guarantee pixel-perfect containment
    for arbitrarily long tooltip content, but the common case (the short `RUN_TYPES` labels actually
    shown) fits comfortably within the panel.
  - **A sixth site was added: `RollingCalendar`'s month-view day pills** (`.pill.actual` for a Strava
    activity, `.pill.planned` for a planned run) — these used to carry a native `title` (the activity
    name, or `buildTitle`'s short "Xk Type" string) same as everywhere else before this pattern. Now
    shows the activity name as `.hovertip-text` for an actual run, and for a planned run, `.hovertip-row`
    pairs for its type and total distance plus (when there's more to it than one flat distance) the
    step-by-step breakdown from `buildDescription` — the same warmup/main/cooldown text the run form's
    own instructions field uses — in a `.hovertip-text.hovertip-steps` block. `.hovertip-steps` sets
    `white-space: pre-line` (instead of `.hovertip-text`'s default `normal`) so `buildDescription`'s own
    line breaks survive instead of collapsing into one run-on line. `.pill` used to carry
    `overflow: hidden` itself (to ellipsis-truncate its own short label defensively) — moved onto a new
    inner `.pill-label` span instead, since a `.hovertip` needs to render *outside* its host's box and
    `overflow: hidden` on the host would have clipped it away entirely (the same class of bug fixed for
    `.bar` above). `.rolling-week` (the 7-column day grid) reuses `.form-context-cell`'s three-zone
    left/center/right anchoring, for the same reason — `.rolling-cal-body`'s `overflow-y: auto` clips the
    x-axis, and a pill flush against the leftmost/rightmost day column (only `.rolling-day`'s 4px padding
    as clearance) centered a tooltip that ran straight past the calendar's own edge.
  - **Two overflow bugs found after the initial five-site rollout, both reported as a tooltip going
    "outside the borders of the card and becoming partially not visible"** (`ActiveWeekCard`'s bar
    segments and both `TrainingLoadGauge` instances — the sidebar one and the run-form one):
    - `.hovertip` had `min-width: max-content` *alongside* `max-width: 220px`. An absolutely-positioned
      auto-width box already shrinks to fit short content with no `min-width` needed (the browser's
      default "shrink-to-fit" sizing) — `min-width: max-content` was redundant for that case and actively
      harmful for a longer one: CSS sizing gives `min-width` priority over `max-width` when the two
      conflict, and `max-content` sizes a wrapping text block as if it could never wrap (its widest
      possible unwrapped line). So `TrainingLoadGauge`'s explanatory paragraph — the longest content any
      `.hovertip` carries — was forced onto one un-wrapped line however wide that made the box, blowing
      straight through `max-width` and the card's edge regardless of how well-centered the tooltip's
      anchor was. Fixed by dropping `min-width: max-content` entirely (short content still hugs its own
      width via the default shrink-to-fit behavior) and reducing `max-width` to `200px` for extra buffer
      against the sidebar/side-panel cards' ~276–290px content width. `.hovertip-row` also had
      `white-space: nowrap`, which — once `min-width: max-content` could no longer force the *box* wide
      enough to fit it — would have let a long row (e.g. "Long Run (planned)" beside its km value) paint
      past `.hovertip`'s own edge instead of respecting `max-width`; removed, so a flex row shrinks and
      wraps onto a second line instead the same way `.hovertip-text` already did.
    - `.bar-seg`'s tooltip centered on the *segment*, but a segment's width is proportional to its share
      of the week's km — often a thin sliver near one end of the bar — so centering a ~200px tooltip on
      a narrow, off-center anchor overflowed the card on whichever side it was closer to, independent of
      the width fix above. Rather than adding `.form-context-cell`-style left/right zones (awkward here
      since the segment count and each one's position are both data-driven, not a fixed 7 columns),
      `.bar` itself was made the positioned ancestor instead of `.bar-seg` (`.bar { position: relative; }`
      / `.bar > .bar-seg.hovertip-host { position: static; }`, overriding the shared `.hovertip-host`
      rule for this one case) — `.bar-seg` keeps the `hovertip-host` class purely so its own `:hover`/
      `:focus-within` still triggers the right segment's tooltip, but the tooltip's `left: 50%` now
      resolves against `.bar`'s full card-width box instead of the segment's, so every segment's tooltip
      centers on the same safe point regardless of which one triggered it (trading per-segment horizontal
      precision — which the tooltip's own content, naming the segment, already makes unambiguous — for
      guaranteed containment).
- **No scrollbar handles, anywhere, ever** — an explicit, standing requirement, not just a style
  preference for a few specific panels. In `styles.css` this is one universal rule (`* { scrollbar-width:
  none; -ms-overflow-style: none; } *::-webkit-scrollbar { display: none; }`), deliberately applied to
  every element rather than an enumerated list of "known" scrollable selectors — every internally-
  scrolling panel (`.rolling-cal-body`, `.list-view`, `.week-history-list`, `.form-context`, both
  modals' `.modal`, `.side-top`, and anything added later) keeps its actual scroll behavior
  (`overflow-y: auto`/`scroll`), just never shows the handle. **Never re-introduce a visible scrollbar
  anywhere in this app**, and don't narrow this back down to a per-selector list — the universal rule
  exists specifically so a newly-added scrollable element is covered automatically, with nothing to
  remember to add.

## Breakpoints (all defined in `styles.css`, not per-component)

| Breakpoint | What changes |
|---|---|
| `min-width: 1000px` | The desktop two-column layout (`main`, `.topbar`) turns on; below it, everything is a single stacked column gated by the mobile tab bar. This is *the* desktop/mobile line for this app. |
| `min-width: 900px` | Modals switch from a single stacked column to two side-by-side panels (RunForm + RunContextPanel), and single-panel popups adopt the shared "standard height". |
| `min-width: 700px` | Modal backdrop centers the modal (`align-items: center`, with padding) instead of docking it as a bottom sheet; modal corners become fully rounded (`--radius` on all 4 corners) instead of only the top 2. |
| `max-width: 700px` | The phone bottom tab bar appears; only one of Today/Calendar/Trends section shows at a time; calendar/list-view height shrinks to 312px. |
| `max-width: 640px` | `HistoryList` rows switch from the 6-column grid to a stacked/wrapped layout (couldn't keep 6 readable columns this narrow). |

See `docs/LAYOUT_DESKTOP.md` and `docs/LAYOUT_MOBILE.md` for the full object-by-object breakdown at
each side of the `1000px` line.
