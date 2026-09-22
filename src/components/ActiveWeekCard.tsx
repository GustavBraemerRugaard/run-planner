import { RUN_TYPES, RUN_TYPE_ORDER, formatKm, parseLocalDate, type WeekSummary } from '../domain/run';

const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** The single "week you're looking at" stat card: total km, run count, and a type breakdown bar. */
export default function ActiveWeekCard({ week }: { week: WeekSummary }) {
  const start = parseLocalDate(week.weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const max = week.totalKm || 1;

  return (
    <section className="active-week">
      <div className="active-week-head">
        <span className="label">
          {fmt(start)} – {fmt(end)}
        </span>
        <strong>{formatKm(week.totalKm)} km</strong>
      </div>
      <div className="bar" title={`${week.runs} run${week.runs === 1 ? '' : 's'}`}>
        {RUN_TYPE_ORDER.filter((t) => week.byType[t]).map((t) => (
          <span
            key={t}
            style={{ width: `${((week.byType[t] ?? 0) / max) * 100}%`, background: RUN_TYPES[t].color }}
            title={`${RUN_TYPES[t].label}: ${formatKm(week.byType[t] ?? 0)} km`}
          />
        ))}
      </div>
      <div className="summary-sub">
        {week.runs} run{week.runs === 1 ? '' : 's'}
      </div>
    </section>
  );
}
