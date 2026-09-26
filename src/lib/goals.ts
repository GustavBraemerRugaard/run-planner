/**
 * A per-week distance goal, entirely local to this browser (there's no server to put it on, and it's
 * a personal target rather than something that needs to sync anywhere). Stored as one JSON map of
 * weekStart ("YYYY-MM-DD", Monday-of-that-week per config) -> goal in km, under a single localStorage key.
 */

const KEY = 'run-planner:week-goals';

function readAll(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** The goal set for this week (km), or null if none was set. */
export function getWeekGoalKm(weekStart: string): number | null {
  const v = readAll()[weekStart];
  return typeof v === 'number' && v > 0 ? v : null;
}

/** Set (or clear, with null) the distance goal for this week. */
export function setWeekGoalKm(weekStart: string, km: number | null): void {
  const all = readAll();
  if (km == null || km <= 0) delete all[weekStart];
  else all[weekStart] = km;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // best-effort; a full/blocked localStorage just means the goal doesn't persist
  }
}
