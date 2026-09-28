/**
 * Trailing rolling average over `windowSamples` consecutive values (the current one plus the
 * preceding `windowSamples - 1`) — a backward-looking window, matching how a live device/app rolling
 * average is usually computed (it can't see future samples yet), rather than a centered window.
 * `null` entries (a bucket with no heartrate reading, say) are skipped rather than treated as zero, so
 * a short gap doesn't drag the average down.
 *
 * Used to smooth the ~10s-bucketed pace/HR streams (see `getActivityStreams` in lib/strava.ts) for
 * `StreamChart`, so the line reads as an "effort trend" rather than raw per-bucket jitter — validated
 * against a live comparison demo (raw vs. several window sizes) before picking 30s as the default.
 */
export function trailingRollingAverage(values: (number | null)[], windowSamples: number): (number | null)[] {
  return values.map((_, i) => {
    const lo = Math.max(0, i - windowSamples + 1);
    let sum = 0;
    let n = 0;
    for (let j = lo; j <= i; j++) {
      const v = values[j];
      if (v != null) {
        sum += v;
        n++;
      }
    }
    return n > 0 ? sum / n : null;
  });
}

/**
 * Removes bad samples from a bucketed pace/HR series *before* `trailingRollingAverage` ever sees them,
 * so a single bad bucket can't drag the axis out (a moment's outlier used to be enough to flatten the
 * rest of a run's real variation to a thin line at the bottom of the chart) or smear itself across the
 * 30s smoothing window that follows. A removed sample becomes `null` — skipped by
 * `trailingRollingAverage` and left as a small gap in `StreamChart`, the same treatment a genuinely
 * missing HR reading already gets — rather than being invented a replacement value.
 *
 * Two independent checks, both applied per metric with its own thresholds (see the call sites in
 * `getActivityStreams`, `lib/strava.ts`):
 *
 *  1. **Absolute range** (`min`/`max`) — a value outside what's physiologically/physically plausible
 *     for the metric at all. This is what actually fixed the reported "outliers eat the axis" problem:
 *     pace is computed as `1000 / speed`, so a bucket where a runner is essentially stationary (stopped
 *     at a light, waiting to cross) has a speed near zero and a pace that *mathematically* blows up
 *     toward infinity — a real near-stop, but not a meaningful "pace" to plot, and dominates the axis
 *     the same as a bad sample would.
 *  2. **Isolated jump** (`jumpThreshold`/`neighborAgreement`) — a bucket whose value differs sharply
 *     from BOTH its immediate neighbors while those two neighbors agree with each other. That specific
 *     shape (near, far, near) is the signature of one bad sample sandwiched between good ones — a
 *     momentary GPS jump or HR-strap glitch — rather than a real, sustained change: a genuine surge or
 *     stop moves multiple consecutive buckets together, so it won't produce two similar-to-each-other,
 *     dissimilar-to-the-middle-one neighbors on both sides.
 */
export function despikeSeries(
  values: (number | null)[],
  {
    min,
    max,
    jumpThreshold,
    neighborAgreement,
  }: {
    /** Values outside [min, max] are dropped outright — see check 1 above. */
    min: number;
    max: number;
    /** A point differing from BOTH neighbors by at least this much is a candidate spike. */
    jumpThreshold: number;
    /** ...but only dropped if those two neighbors are within this much of each other — see check 2
     * above. Kept smaller than `jumpThreshold` so a real, gradual trend (each bucket a little further
     * from the last) never satisfies both conditions at once. */
    neighborAgreement: number;
  },
): (number | null)[] {
  const out = values.map((v) => (v != null && v >= min && v <= max ? v : null));
  for (let i = 1; i < out.length - 1; i++) {
    const v = out[i];
    const prev = out[i - 1];
    const next = out[i + 1];
    if (v == null || prev == null || next == null) continue;
    const neighborsAgree = Math.abs(prev - next) <= neighborAgreement;
    const isolatedSpike = neighborsAgree && Math.abs(v - prev) >= jumpThreshold && Math.abs(v - next) >= jumpThreshold;
    if (isolatedSpike) out[i] = null;
  }
  return out;
}
