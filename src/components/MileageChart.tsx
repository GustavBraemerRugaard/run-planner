import { useMemo } from 'react';
import {
  RUN_TYPES,
  RUN_TYPE_ORDER,
  formatKm,
  localDateString,
  parseLocalDate,
  weekKey,
  type WeekSummary,
} from '../domain/run';

interface Props {
  weeks: Map<string, WeekSummary>;
  /** Week (Monday) that the chart period ends on, inclusive. */
  endWeekStart: string;
  count: number;
  onCountChange: (n: number) => void;
  firstDay: number;
}

const CHART_HEIGHT = 140;

export default function MileageChart({ weeks, endWeekStart, count, onCountChange, firstDay }: Props) {
  const period = useMemo(() => {
    const end = parseLocalDate(endWeekStart);
    const out: WeekSummary[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i * 7);
      const key = localDateString(d);
      out.push(weeks.get(key) ?? { weekStart: key, totalKm: 0, runs: 0, byType: {} });
    }
    return out;
  }, [weeks, endWeekStart, count]);

  const max = Math.max(...period.map((w) => w.totalKm), 1);
  const gridlines = [0.25, 0.5, 0.75, 1];
  const avg = period.reduce((s, w) => s + w.totalKm, 0) / (period.length || 1);

  return (
    <section className="chart-card">
      <div className="chart-head">
        <span className="label">Weekly mileage</span>
        <label className="weeks-input">
          last
          <input
            type="number"
            min={4}
            max={52}
            value={count}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isFinite(n)) onCountChange(Math.min(52, Math.max(4, n)));
            }}
          />
          weeks
        </label>
      </div>

      <div className="chart-plot" style={{ height: CHART_HEIGHT }}>
        {gridlines.map((g) => (
          <div key={g} className="chart-gridline" style={{ bottom: `${g * 100}%` }}>
            <span>{formatKm(max * g)}</span>
          </div>
        ))}
        <div className="chart-bars">
          {period.map((w) => {
            const isCurrent = w.weekStart === weekKey(new Date(), firstDay);
            return (
              <div key={w.weekStart} className="chart-bar-col" title={`${w.weekStart}: ${formatKm(w.totalKm)} km, ${w.runs} run${w.runs === 1 ? '' : 's'}`}>
                <div className={`chart-bar ${isCurrent ? 'current' : ''}`} style={{ height: `${(w.totalKm / max) * 100}%` }}>
                  {RUN_TYPE_ORDER.filter((t) => w.byType[t]).map((t) => (
                    <span
                      key={t}
                      style={{ height: `${((w.byType[t] ?? 0) / (w.totalKm || 1)) * 100}%`, background: RUN_TYPES[t].color }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="chart-foot">
        <span>{period[0] && new Date(parseLocalDate(period[0].weekStart)).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
        <span className="chart-avg">avg {formatKm(avg)} km/wk</span>
        <span>{period[period.length - 1] && new Date(parseLocalDate(period[period.length - 1].weekStart)).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
      </div>
    </section>
  );
}
