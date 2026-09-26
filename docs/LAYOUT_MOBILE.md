# Mobile / phone layout (below 1000px, with narrower sub-breakpoints)

Covers everything below the app's `min-width: 1000px` desktop breakpoint. This is **not** simply the
desktop layout scaled down — several objects restructure, get replaced, or disappear entirely below
this line. Read `docs/ARCHITECTURE.md` first for shared tokens/patterns, and
`docs/LAYOUT_DESKTOP.md` for what each object looks like on the other side of the breakpoint (useful
context for *why* a given mobile treatment differs).

There isn't a single "mobile" breakpoint number for every rule — different concerns switch at
different widths (`1000px` main layout, `700px` modal docking + tab bar, `640px` weekly-history
columns). All of them are listed here in one place because on a phone, several apply simultaneously.

## The defining structural difference: tab-gated single column

Below `1000px`, `main` collapses to a single grid column (no side rail), and `.topbar` collapses to a
single grid column too (the 300px second column only exists at `≥1000px`). Everything that would sit
side-by-side on desktop instead stacks in document order, and a **bottom tab bar** (`.mobile-tabbar`,
only rendered/visible at `max-width: 700px`) shows exactly one of three sections at a time:

- **Today** tab → `.section-today` (the `TodayCard`)
- **Calendar** tab → `.section-calendar` (the calendar box + weekly history list)
- **Trends** tab → `.section-trends` (the side-rail widgets + mileage chart)

This is done with a class on the root `.app` element (`mobile-tab-today` / `mobile-tab-calendar` /
`mobile-tab-trends`, from `App.tsx`'s `mobileTab` state) plus `display: none` on the non-active
`.mobile-section`s. **All three sections' React trees stay mounted at all times** — switching tabs is
pure CSS visibility, not conditional rendering — so state inside them (scroll position, in-progress
form input, etc.) is preserved across tab switches. `.app` also gets `padding-bottom: 64px` at this
width so the fixed tab bar never overlaps the last bit of scrollable content.

Between `700px` and `1000px` (a tablet-ish width), there is currently **no tab bar** — all three
sections render stacked in one column, all visible at once, in document order (Today, then Calendar,
then Trends/side-widgets). The tab-gating only kicks in at `≤700px`. Don't assume `<1000px` always
means "tabbed" — the tab bar's own breakpoint is narrower than the layout-collapse breakpoint.

### Mobile tab bar (`.mobile-tabbar`, ≤700px only)

Fixed to the bottom of the viewport (`position: fixed; left: 0; right: 0; bottom: 0`), full width,
`var(--panel)` background, `1px` top border, `z-index: 20` (above scrolling content). Padding includes
`env(safe-area-inset-bottom)` so it clears the home-indicator area on notched phones. Three equal-flex
buttons (Today / Calendar / Trends), the active one filled `--accent` + bold; inactive ones are plain
text in `--muted`. This is the **only** navigation mechanism between the three sections on a phone —
there is no scrolling past one section into the next.

## Today card (mobile: its own tab, not a fixed strip)

Same `TodayCard` component and internal layout as desktop (see the desktop doc — nothing about its own
internals changes), but here it's not a small strip above other content; it fully occupies its own tab
when selected, as the sole content of `.section-today`.

## Calendar section (mobile: shorter, single view at a time, same toolbar)

`.cal-toolbar` (Today button + Month/List `.view-toggle`) is unchanged in structure and shows exactly
the same way as desktop. What changes is size and what's stacked below it:

- **`.rolling-cal` / `.list-view` height drops from 472px to 312px** at `max-width: 700px` — a phone
  screen can't spare as much vertical room for the calendar as a desktop side-by-side layout can, given
  the tab bar and single-column stacking. This is a hard, explicit override
  (`.rolling-cal, .list-view { height: 312px; max-height: 312px; }`), not a proportional shrink.
- `WeeklyHistoryList` sits directly below the calendar in the same `.cal-col`, same as desktop — but
  since there's no side-rail height-matching happening at this width (the `calHeight`-driven
  `.side-top` sizing in `App.tsx` is explicitly gated to `matchMedia('(min-width: 1000px)')` and passes
  `undefined` below it), the weekly-history list here is simply its own natural, unconstrained height —
  it is **not** coupled to anything else's height on mobile the way it is on desktop.
- **At `max-width: 640px`**, `WeeklyHistoryList`'s rows additionally restructure: the fixed 6-column
  grid (`1fr 50px 84px 104px 90px 76px`) can't stay readable this narrow, so `.week-history-row`
  switches to a single column (`grid-template-columns: 1fr`) with the date range on its own line and
  `.week-history-stats` becoming a `flex-wrap` row that wraps the 5 stat entries onto as many lines as
  they need, each sized to its own natural content width — not squeezed into an equal, too-narrow
  share. This is a genuinely different internal structure from the desktop 6-column grid, not just a
  narrower version of it.

## Trends section (mobile: same three cards + chart, but naturally stacked — no height forcing)

`LatestRunCard`, `ActiveWeekCard`, `AverageStatsCard`, and `MileageChart` are the exact same components
with the exact same internal content/behavior as desktop (see the desktop doc for what's inside each —
none of that changes here), but the desktop-only height-matching mechanism does **not** apply:

- `.side-top`'s explicit pixel height (normally pinned to match the calendar box's height on desktop)
  is `undefined` below `1000px` — so on mobile it's simply a plain flex column sized to its natural
  content, `16px` gap between the three cards, no forced total height and no "last card absorbs slack"
  behavior (there's no slack to absorb — nothing is forcing a taller-than-natural height).
- `MileageChart` likewise isn't forced to match the weekly-history list's height here — it's simply its
  own natural card height, `.chart-plot` at its fixed `140px` height as always.
- The **Active Week Card's fixed-size behavior is still worth preserving on mobile too**, even though
  it's no longer needed to satisfy a *height-matching* requirement: it still shouldn't visibly resize
  as you browse between weeks on a phone, for the same "doesn't read as broken/jittery" reason as
  desktop. The always-render-all-slots / reserved-2-lines-for-the-hint mechanism described in the
  desktop doc is implemented in the component/CSS itself (not gated by the `1000px` breakpoint), so it
  applies here unchanged — don't accidentally make it breakpoint-conditional if touching this.
- The rotated mileage-chart x-axis labels (see desktop doc) are likewise not breakpoint-gated — they
  render the same rotated way on a narrow phone screen, where the vertical-space saving matters just as
  much (if not more) than on the 300px desktop side rail.

## Modals (below 700px: a bottom sheet, not a centered dialog)

`.modal-backdrop` uses `align-items: flex-end` by default (before the `≥700px` override), so below
`700px` both `RunForm` and `ActivityDetail` dock to the **bottom of the screen** as a full-width sheet,
rather than a centered dialog with margin around it. Concretely, below `700px`:

- No `padding` around the backdrop (full-bleed to the viewport edges).
- `.modal` / `.form-context` corners are rounded only on **top** (`border-radius: 2px 2px 0 0`) — flat
  against the bottom of the screen, since there's no visible bottom edge to round.
- `.modal`'s bottom padding includes `env(safe-area-inset-bottom)` so content never sits under a
  home-indicator/gesture-bar area.
- Below `900px` (which includes all of mobile), `RunForm`'s form and `RunContextPanel` are **not**
  side-by-side — `.modal-wrap` is a single stacked column (`flex-direction: column` is the default,
  only overridden to `row` at `≥900px`), so on a phone you scroll down through the form and then
  (further down, still inside the same sheet) the context panel below it, rather than seeing both at
  once. There is no separate "standard modal height" matching on mobile either (that JS mechanism is
  itself gated to `matchMedia('(min-width: 900px)')`) — each modal simply sizes to its own natural
  stacked content, capped at `max-height: 92vh` with internal scrolling.
- Inputs and the pace/date text fields are all `font-size: 16px` — this is a deliberate anti-zoom
  measure (iOS Safari auto-zooms into any input below 16px), not an arbitrary size choice; don't shrink
  input font sizes below this on any breakpoint that could run on an iPhone.

## Things that do *not* change between desktop and mobile

Worth stating explicitly, since it's easy to assume more changes at the breakpoint than actually does:

- Card shell, colors, spacing tokens, segmented-toggle styling, radius, type scale — all identical.
- The topbar action group (Google/Strava/add/refresh) — same icon-only segmented toolbar, just in a
  single-column topbar grid instead of a `1fr 300px` one.
- Every component's *internal* content and behavior (what stats it shows, how it computes them, click
  targets) — only outer sizing/stacking/visibility changes at these breakpoints, not component logic.
- Dark mode — the same `prefers-color-scheme` media query and same token overrides apply regardless of
  viewport width; dark mode and the mobile/desktop breakpoint are fully independent axes.
