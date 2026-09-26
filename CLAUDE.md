# Working on Run Planner

Before making any UI/layout/styling change in this repo, read `docs/ARCHITECTURE.md` and whichever of
`docs/LAYOUT_DESKTOP.md` / `docs/LAYOUT_MOBILE.md` covers the breakpoint you're touching. These
describe every visual object's shape, size, spacing, alignment, and — importantly — the *reasoning*
behind it (often the result of a specific, earlier user request). Treat documented behavior as
intentional, not as something to casually change while addressing an unrelated request.

After making a change that affects layout, components, breakpoints, or the design tokens in
`styles.css`, update the relevant section(s) of those same docs in the same round of work. An
undocumented change is an incomplete change. Keep the "why," not just the "what" — future changes need
the reasoning to know what they're allowed to touch.

If a new request seems to conflict with something documented, say so rather than silently overriding
it — the doc may be capturing an explicit decision from an earlier conversation.
