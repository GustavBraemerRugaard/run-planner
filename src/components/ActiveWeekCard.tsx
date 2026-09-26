import { useMemo } from 'react';
import {
  ACTUAL_COLOR,
  RUN_TYPES,
  RUN_TYPE_ORDER,
  computeTrainingLoad,
  formatKm,
  parseLocalDate,
  type CombinedWeekSummary,
  type DayEntries,
  type TrainingLoadZone,
} from '../domain/run';

const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

// Kept short (with the "ACWR X.XX · " prefix in front, at the side panel's ~276px content width)
// so every zone's hint wraps to at most 2 lines — see .training-load-hint's min-height in styles.css,
// which reserves exactly that much room so the card's height doesn't shift as you browse between weeks.
const ZONE_INFO: Record<TrainingLoadZone, { label: string; hint: string }> = {
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
  week: CombinedWeekSummary;
  dayEntries: Map<string, DayEntries>;
  /** Training load is computed "as of" this date — the current moment when the calendar's active week
   * is this week (so a still-in-progress week reads correctly), otherwise the last day of whichever
   * week is active in the calendar, so browsing to a past/future week shows the load picture as it
   * stood then. */
  asOfDate: Date;
}

/**
 * The single "week you're looking at" stat card. Past days count what Strava actually recorded;
 * today/future days count what's planned (shown as a lighter "still planned" segment) until they're run.
 * Also carries the acute:chronic training-load (ACWR) signal, computed as of `asOfDate`.
 *
 * The card's own size is meant to stay constant as you browse between weeks — never taller for one
 * week and shorter for the next — so the training-load block is always rendered (with a "not enough
 * history yet" fallback state on weeks where there isn't enough data for a ratio) rather than being
 * added/removed, and the hint line below the gauge reserves room for two lines regardless of how long
 * that particular zone's hint text happens to be.
 */
export default function ActiveWeekCard({ week, dayEntries, asOfDate }: Props) {
  const start = parseLocalDate(week.weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const max = week.totalKm || 1;
  const plannedKm = week.totalKm - week.actualKm;

  const load = useMemo(() => computeTrainingLoad(dayEntries, asOfDate), [dayEntries, asOfDate]);
  const zoneInfo = load.acwr != null ? ZONE_INFO[load.zone] : null;
  const markerPct = load.acwr == null ? null : Math.min(100, (Math.min(load.acwr, GAUGE_MAX) / GAUGE_MAX) * 100);

  return (
    <section className="active-week">
      <span className="label title">Active week</span>
      <div className="active-week-head">
        <span className="fine">
          {fmt(start)} – {fmt(end)}
        </span>
        <strong>{formatKm(week.totalKm)} km</strong>
      </div>
      <div className="bar" title={`${week.runs} run${week.runs === 1 ? '' : 's'}`}>
        {week.actualKm > 0 && (
          <span className="bar-seg" style={{ width: `${(week.actualKm / max) * 100}%`, background: ACTUAL_COLOR }} title={`Run: ${formatKm(week.actualKm)} km`} />
        )}
        {RUN_TYPE_ORDER.filter((t) => week.byType[t]).map((t) => (
          <span
            key={t}
            className="bar-seg"
            style={{ width: `${((week.byType[t] ?? 0) / max) * 100}%`, background: RUN_TYPES[t].color }}
            title={`${RUN_TYPES[t].label} (planned): ${formatKm(week.byType[t] ?? 0)} km`}
          />
        ))}
      </div>
      <div className="summary-sub">
        {week.runs} run{week.runs === 1 ? '' : 's'}
        {week.isPlanned && plannedKm > 0 && ` · ${formatKm(plannedKm)} km still planned`}
      </div>

      <div
        className="training-load"
        title="Acute:chronic workload ratio (7-day vs 28-day training load, EWMA-smoothed) — a directional injury-risk signal, not a diagnosis."
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
    </section>
  );
}
