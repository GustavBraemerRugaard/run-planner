import { useState } from 'react';
import {
  formatDuration,
  formatKm,
  formatPace,
  localDateString,
  monthKey,
  parseLocalDate,
  trend,
  weekKey,
  type ActualPeriodSummary,
  type Trend,
} from '../domain/run';

interface Props {
  weeks: Map<string, ActualPeriodSummary>;
  months: Map<string, ActualPeriodSummary>;
  firstDay: number;
}

type Granularity = 'week' | 'month';

const dayFmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const monthFmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

function TrendArrow({ dir }: { dir: Trend }) {
  if (dir === 'flat') return null;
  return <span className={`trend ${dir}`}>{dir === 'up' ? '▲' : '▼'}</span>;
}

function emptyPeriod(key: string): ActualPeriodSummary {
  return { periodStart: key, runs: 0, totalKm: 0, totalTimeSec: 0, avgPaceSecPerKm: null, avgHeartRate: null };
}

function prevWeekKey(key: string): string {
  const d = parseLocalDate(key);
  d.setDate(d.getDate() - 7);
  return localDateString(d);
}

function prevMonthKey(key: string): string {
  const d = parseLocalDate(key);
  d.setMonth(d.getMonth() - 1);
  return localDateString(d);
}

const PERIODS_SHOWN = 12;

/**
 * Scrollable list of the last 12 periods (including the current, possibly partial one), actual Strava
 * data, with period-on-period trend arrows. Toggles between two granularities — week and calendar month
 * — via the same segmented-toggle pattern used elsewhere in the app (`AverageStatsCard`'s 4w/12w
 * toggle, `MileageChart`'s view toggle): the underlying data (`weeks`/`months`, both precomputed in
 * `App.tsx` via `summarizeActualWeeks`/`summarizeActualMonths`) and the row layout are identical between
 * the two modes, only the period length and its date-range label change. Periods with no recorded runs
 * still get a row (0 runs) rather than being skipped, so the list always covers the full 12-period span.
 * Every row shares the same grid columns, so each metric lands in exactly the same horizontal position
 * from one period to the next.
 */
export default function HistoryList({ weeks, months, firstDay }: Props) {
  const [granularity, setGranularity] = useState<Granularity>('week');
  const isWeek = granularity === 'week';
  const data = isWeek ? weeks : months;
  const prevKeyOf = isWeek ? prevWeekKey : prevMonthKey;
  const currentKey = isWeek ? weekKey(new Date(), firstDay) : monthKey(new Date());

  const sorted: string[] = [];
  let key = currentKey;
  for (let i = 0; i < PERIODS_SHOWN; i++) {
    sorted.push(key);
    key = prevKeyOf(key);
  }

  return (
    <section className="week-history">
      <div className="week-history-head">
        <span className="label title">History</span>
        <div className="week-history-toggle">
          <button type="button" className={isWeek ? 'active' : ''} onClick={() => setGranularity('week')}>
            Week
          </button>
          <button type="button" className={!isWeek ? 'active' : ''} onClick={() => setGranularity('month')}>
            Month
          </button>
        </div>
      </div>
      <div className="week-history-list">
        {sorted.map((key) => {
          const w = data.get(key) ?? emptyPeriod(key);
          const prevKey = prevKeyOf(key);
          const prev = data.get(prevKey) ?? emptyPeriod(prevKey);
          const start = parseLocalDate(key);
          const isCurrent = key === currentKey;
          let rangeLabel: string;
          if (isWeek) {
            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            rangeLabel = `${dayFmt(start)}–${dayFmt(end)}`;
          } else {
            rangeLabel = monthFmt(start);
          }
          return (
            <div key={key} className={`week-history-row ${isCurrent ? 'current' : ''}`}>
              <div className="week-history-range">
                {rangeLabel}
                {isCurrent && <span className="list-today-badge">{isWeek ? 'This week' : 'This month'}</span>}
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
