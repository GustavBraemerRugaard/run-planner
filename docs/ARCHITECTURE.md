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
  - **Strava API** — the source of completed-run data (distance, time, pace, HR, cadence, laps).
    Strava's OAuth flow requires a confidential client secret, which can't live in a static site, so
    token exchange/refresh is proxied through a small Cloudflare Worker (`worker/`); the browser never
    holds the Strava client secret.
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
    strava.ts               — Strava OAuth (via the Cloudflare Worker), activities, laps, personal bests
    goals.ts                — per-week goal, localStorage-only
    modalSize.ts             — sessionStorage-based "standard modal height" shared between popups
  components/
    RollingCalendar.tsx     — desktop/tablet month-grid calendar view (see layout docs)
    ListView.tsx            — flat chronological list calendar view (the other view-toggle option)
    TodayCard.tsx           — "today + this week" summary (desktop top strip / mobile "Today" tab)
    LatestRunCard.tsx       — side-panel: most recent Strava run
    ActiveWeekCard.tsx      — side-panel: the calendar's currently-browsed week + training load (ACWR)
    AverageStatsCard.tsx    — side-panel: weekly averages over last 4 or 12 weeks
    WeeklyHistoryList.tsx   — below the calendar: scrollable list of the last 12 weeks, actual data
    MileageChart.tsx        — side-panel: weekly mileage bar chart with rotated date labels
    RunForm.tsx             — create/edit-run modal (the form half of the two-panel popup)
    RunContextPanel.tsx     — create/edit-run modal (the context half — surrounding week's runs)
    ActivityDetail.tsx      — view-a-completed-run modal (laps, pace/HR charts)
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
  chip/pill/segment (calendar pills, chart segments, form-context dots, bar chart, etc.).
- **Completed runs** (Strava activities) are always shown in one fixed color (`ACTUAL_COLOR = #f97316`,
  orange), distinct from every planned-run color, so "done" vs "planned" is always visually obvious
  regardless of run type.
- **Training load (ACWR)** — acute:chronic workload ratio, EWMA-smoothed (7-day acute / 28-day chronic,
  Foster's session-RPE-style load), classified into 4 zones (low / optimal / elevated / high) at
  Gabbett (2016) thresholds (0.8 / 1.3 / 1.5). See `computeTrainingLoad` in `domain/run.ts` and the
  Active Week card in the layout docs for how it's presented.

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
  everywhere a run appears (calendar pills, list entries, bar/chart segments, form-context dots) — never
  invert or blend this convention for a new surface.
- **Equal-gap-spread over equal-width-grid** for a row of natural-width stats (`.latest-run-stats`,
  `.activity-totals`, `.today-week-total`, `.topbar` vs. the 300px side rail): `justify-content:
  space-between` over naturally-sized items, so the *last* item's own right edge lands flush with the
  container's right edge — not an equal-width grid, which would leave left-aligned text short of the
  edge. Reuse this trick for new "a few stats in a row" widgets.
- **Always-render-all-slots-with-a-placeholder**: widgets that have several potential values per run
  (LatestRunCard's 5 metric slots, WeeklyHistoryList's 5 stat columns, ActiveWeekCard's training-load
  block) always render every slot, using "—" or a neutral fallback state for missing data, rather than
  conditionally omitting a slot. This exists specifically so a card's size and layout stay constant
  regardless of which particular data happens to be available for the thing it's currently showing —
  see `docs/LAYOUT_DESKTOP.md`'s Active Week Card section for the fullest example of why this matters
  (a card that resizes as you browse between weeks reads as broken/jittery).
- **Height-matching via JS + ResizeObserver + matchMedia**, not CSS alone: several places measure one
  element's actual rendered height and apply it as a sibling's explicit height/maxHeight (side-top ↔
  calendar box; RunForm ↔ RunContextPanel; the shared "standard modal height" in `modalSize.ts` between
  RunForm and ActivityDetail). CSS `align-items: stretch` cannot be used for these because a stretched
  sibling's *own* border would land in the wrong place (see the `align-items: normal` computes to
  `stretch`, not `flex-start`, gotcha documented inline in `styles.css` above `.modal-wrap`'s
  `≥900px` rule) — always gate this kind of JS sizing behind the same `matchMedia` breakpoint used by
  the corresponding CSS rule, and disable it (pass `undefined`) below that breakpoint so mobile's
  natural, content-sized stacking isn't overridden.
- **Scrollable-but-no-visible-scrollbar** (`.no-scrollbar` in `styles.css`, applied to `.rolling-cal-body`,
  `.list-view`, `.week-history-list`, and `.form-context`): every internally-scrolling panel in the app
  keeps its scroll behavior (`overflow-y: auto`/`scroll`) but hides the scroll handle itself
  (`scrollbar-width: none` + a `::-webkit-scrollbar { display: none }` override), rather than showing a
  native scrollbar. A new scrollable panel should join this same shared rule instead of introducing its
  own scrollbar-hiding CSS or, worse, leaving its scrollbar visible.

## Breakpoints (all defined in `styles.css`, not per-component)

| Breakpoint | What changes |
|---|---|
| `min-width: 1000px` | The desktop two-column layout (`main`, `.topbar`) turns on; below it, everything is a single stacked column gated by the mobile tab bar. This is *the* desktop/mobile line for this app. |
| `min-width: 900px` | Modals switch from a single stacked column to two side-by-side panels (RunForm + RunContextPanel), and single-panel popups adopt the shared "standard height". |
| `min-width: 700px` | Modal backdrop centers the modal (`align-items: center`, with padding) instead of docking it as a bottom sheet; modal corners become fully rounded (`--radius` on all 4 corners) instead of only the top 2. |
| `max-width: 700px` | The phone bottom tab bar appears; only one of Today/Calendar/Trends section shows at a time; calendar/list-view height shrinks to 312px. |
| `max-width: 640px` | `WeeklyHistoryList` rows switch from the 6-column grid to a stacked/wrapped layout (couldn't keep 6 readable columns this narrow). |

See `docs/LAYOUT_DESKTOP.md` and `docs/LAYOUT_MOBILE.md` for the full object-by-object breakdown at
each side of the `1000px` line.
