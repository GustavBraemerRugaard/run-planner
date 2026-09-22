import { formatDuration, formatKm, formatPace, localDateString, parseLocalDate, trend, weekKey, type ActualWeekSummary, type Trend } from '../domain/run';

interface Props {
  weeks: Map<string, ActualWeekSummary>;
  firstDay: number;
}

const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function TrendArrow({ dir }: { dir: Trend }) {
  if (dir === 'flat') return null;
  return <span className={`trend ${dir}`}>{dir === 'up' ? '▲' : '▼'}</span>;
}

function emptyWeek(key: string): ActualWeekSummary {
  return { weekStart: key, runs: 0, totalKm: 0, totalTimeSec: 0, avgPaceSecPerKm: null, avgHeartRate: null };
}

function prevWeekKey(key: string): string {
  const d = parseLocalDate(key);
  d.setDate(d.getDate() - 7);
  return localDateString(d);
}

const WEEKS_SHOWN = 12;

/**
 * Scrollable list of the last 12 weeks (including the current one), actual Strava data, with
 * week-on-week trend arrows. Weeks with no recorded runs still get a row (0 runs) rather than
 * being skipped, so the list always covers the full 12-week span. Every row shares the same grid
 * columns, so each metric lands in exactly the same horizontal position from one week to the next.
 */
export default function WeeklyHistoryList({ weeks, firstDay }: Props) {
  const currentWeekStart = weekKey(new Date(), firstDay);
  const sorted: string[] = [];
  let key = currentWeekStart;
  for (let i = 0; i < WEEKS_SHOWN; i++) {
    sorted.push(key);
    key = prevWeekKey(key);
  }

  return (
    <section className="week-history">
      <span className="label">Weekly history</span>
      <div className="week-history-list">
        {sorted.map((key) => {
          const w = weeks.get(key) ?? emptyWeek(key);
          const prev = weeks.get(prevWeekKey(key)) ?? emptyWeek(prevWeekKey(key));
          const start = parseLocalDate(key);
          const end = new Date(start);
          end.setDate(end.getDate() + 6);
          const isCurrent = key === currentWeekStart;
          return (
            <div key={key} className={`week-history-row ${isCurrent ? 'current' : ''}`}>
              <div className="week-history-range">
                {fmt(start)}–{fmt(end)}
                {isCurrent && <span className="list-today-badge">This week</span>}
              </div>
              <div className="week-history-stats">
                <div>
                  <strong>{w.runs}</strong>
                  <span>runs</span>
                </div>
                <div>
                  <strong>{formatKm(w.totalKm)}</strong>
                  <span>km</span>
                  <TrendArrow dir={trend(w.totalKm, prev.totalKm)} />
                </div>
                <div>
                  <strong>{w.totalTimeSec ? formatDuration(w.totalTimeSec) : '—'}</strong>
                  <span>time</span>
                  <TrendArrow dir={trend(w.totalTimeSec, prev.totalTimeSec)} />
                </div>
                <div>
                  <strong>{w.avgPaceSecPerKm ? formatPace(w.avgPaceSecPerKm) : '—'}</strong>
                  <span>/km</span>
                  <TrendArrow dir={trend(w.avgPaceSecPerKm, prev.avgPaceSecPerKm)} />
                </div>
                <div>
                  <strong>{w.avgHeartRate ? Math.round(w.avgHeartRate) : '—'}</strong>
                  <span>bpm</span>
                  <TrendArrow dir={trend(w.avgHeartRate, prev.avgHeartRate)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
