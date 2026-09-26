import { ACTUAL_COLOR, RUN_TYPES, RUN_TYPE_ORDER, formatKm, parseLocalDate, type CombinedWeekSummary } from '../domain/run';

const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * The single "week you're looking at" stat card. Past days count what Strava actually recorded;
 * today/future days count what's planned (shown as a lighter "still planned" segment) until they're run.
 */
export default function ActiveWeekCard({ week }: { week: CombinedWeekSummary }) {
  const start = parseLocalDate(week.weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const max = week.totalKm || 1;
  const plannedKm = week.totalKm - week.actualKm;

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
    </section>
  );
}
