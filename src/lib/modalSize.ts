const KEY = 'modal_standard_height_px';
/** A reasonable guess before any edit/create-run popup has ever been measured this session. */
const FALLBACK_HEIGHT = 640;

/**
 * The app's popups are meant to all share one size — the edit/create-run box is the standard, per
 * earlier feedback ("use the edit/create run box(es) as the correct width/height standard for all pop
 * up boxes/widgets"). Width is a fixed CSS max-width shared by every popup, but height is driven by the
 * run-form's own content (so it never has dead space below its buttons), which varies run to run. Since
 * a single-panel popup like the activity-detail view is never open at the same time as the run form to
 * measure directly against, RunForm persists its last-measured height here, and other popups read it
 * back to match themselves to it (scrolling their own content if it's taller).
 */
export function saveStandardModalHeight(px: number): void {
  try {
    sessionStorage.setItem(KEY, String(Math.round(px)));
  } catch {
    // best-effort only — a popup just falls back to its own natural size if this can't be read back.
  }
}

export function getStandardModalHeight(): number {
  try {
    const raw = sessionStorage.getItem(KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : FALLBACK_HEIGHT;
  } catch {
    return FALLBACK_HEIGHT;
  }
}
