import type { TrainingLoad, TrainingLoadZone } from '../domain/run';

// Kept short (with the "ACWR X.XX · " prefix in front, at the side panel's ~276px content width)
// so every zone's hint wraps to at most 2 lines — see .training-load-hint's min-height in styles.css,
// which reserves exactly that much room so a card using this gauge doesn't shift height as the zone
// underneath it changes.
export const ZONE_INFO: Record<TrainingLoadZone, { label: string; hint: string }> = {
  low: { label: 'Low load', hint: 'Below your usual — room to build back up.' },
  optimal: { label: 'On track', hint: "In the sports-science \"sweet spot\"." },
  elevated: { label: 'Elevated', hint: 'Ramping up fast — ease off soon.' },
  high: { label: 'High risk', hint: 'Sharp jump — closely linked to injury.' },
};
const ZONE_ORDER: TrainingLoadZone[] = ['low', 'optimal', 'elevated', 'high'];
/** Where each zone boundary (0.8 / 1.3 / 1.5) sits along the gauge, and where to cap an off-the-chart
 * ACWR so the marker always stays on the bar. */
const GAUGE_MAX = 2;
const GAUGE_STOPS: Record<TrainingLoadZone, number> = { low: 0.8, optimal: 1.3, elevated: 1.5, high: GAUGE_MAX };

interface Props {
  load: TrainingLoad;
  /** Overrides the default hover tooltip — e.g. to note that this particular gauge includes a draft
   * run that hasn't been saved yet. */
  title?: string;
}

/**
 * The acute:chronic training-load gauge: zone label, a colored segmented bar with a position marker,
 * and a short zone-hint line — always rendered (with a "not enough data" fallback state) rather than
 * hidden, so a card using it doesn't change size depending on whether there's enough history for a
 * ratio yet. Shared between `ActiveWeekCard` (this week's actual load) and `RunContextPanel` (what the
 * run currently being edited would do to that load if saved), so the visual language for "how risky is
 * this load" never diverges between the two surfaces.
 */
export default function TrainingLoadGauge({ load, title }: Props) {
  const zoneInfo = load.acwr != null ? ZONE_INFO[load.zone] : null;
  const markerPct = load.acwr == null ? null : Math.min(100, (Math.min(load.acwr, GAUGE_MAX) / GAUGE_MAX) * 100);

  return (
    <div
      className="training-load"
      title={
        title ??
        'Acute:chronic workload ratio (7-day vs 28-day training load, EWMA-smoothed) — a directional injury-risk signal, not a diagnosis.'
      }
    >
      <div className="training-load-head">
        <span className="label">Training load</span>
        <strong className={`training-load-zone zone-${zoneInfo ? load.zone : 'low'}`}>
          {zoneInfo ? zoneInfo.label : 'Not enough data'}
        </strong>
      </div>
      <div className={`training-load-gauge zone-${zoneInfo ? load.zone : 'low'}`}>
        {ZONE_ORDER.map((z, i) => {
          const prevStop = i === 0 ? 0 : GAUGE_STOPS[ZONE_ORDER[i - 1]];
          const widthPct = ((GAUGE_STOPS[z] - prevStop) / GAUGE_MAX) * 100;
          return <span key={z} className={`training-load-gauge-seg seg-${zoneInfo ? z : 'low'}`} style={{ width: `${widthPct}%` }} />;
        })}
        {markerPct != null && <span className="training-load-marker" style={{ left: `${markerPct}%` }} />}
      </div>
      <div className="fine training-load-hint">
        {zoneInfo ? (
          <>
            ACWR {load.acwr!.toFixed(2)} · {zoneInfo.hint}
          </>
        ) : (
          'Not enough history yet for a ratio.'
        )}
      </div>
    </div>
  );
}
