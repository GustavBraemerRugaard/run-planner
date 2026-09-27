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
} from '../domain/run';
import TrainingLoadGauge from './TrainingLoadGauge';

const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

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

      <TrainingLoadGauge load={load} />
    </section>
  );
}
