/**
 * Small axis/tick helpers shared by every "distance on the x-axis, a value on the y-axis" chart in the
 * app (LapChart and StreamChart in ActivityDetail.tsx) — pulled out here once a second chart needed
 * the exact same rounding rules, rather than letting the two drift apart.
 */

/** Rounds `v` DOWN to the nearest multiple of `step` — used for the axis minimum, which must never
 * land above the padded observed minimum (rounding to the "nearest" multiple instead could round up
 * and eat into the required padding, or even land above the observed minimum itself). */
export function floorToStep(v: number, step: number): number {
  return Math.floor(v / step) * step;
}

/** Rounds `v` UP to the nearest multiple of `step` — the maximum's counterpart to `floorToStep`. */
export function ceilToStep(v: number, step: number): number {
  return Math.ceil(v / step) * step;
}

/**
 * `count` y-axis tick VALUES evenly spaced, by position, between `axisMin` and `axisMax` (inclusive
 * of both ends) — always `count` of them (min, `count - 2` evenly-spaced values in between, max),
 * regardless of whether the in-between values land on a "nice" round number. Each tick's vertical
 * POSITION uses its exact value, so it still lines up precisely with where that value falls; the label
 * TEXT shown for it is rounded separately by the caller's own formatter, so the axis reads as clean
 * integers without the tick marks themselves needing to snap to a rounded value first.
 */
export function evenTicks(axisMin: number, axisMax: number, count = 5): number[] {
  const span = axisMax - axisMin;
  if (span <= 0) return [axisMin];
  return Array.from({ length: count }, (_, i) => axisMin + (span * i) / (count - 1));
}

/** A "nice" round-km step for x-axis ticks, scaled to how far the run covered. */
export function niceKmStep(totalKm: number): number {
  if (totalKm <= 3) return 0.5;
  if (totalKm <= 6) return 1;
  if (totalKm <= 12) return 2;
  if (totalKm <= 25) return 5;
  return 10;
}
