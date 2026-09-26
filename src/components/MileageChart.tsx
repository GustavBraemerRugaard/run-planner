import { useMemo } from 'react';
import {
  ACTUAL_COLOR,
  RUN_TYPES,
  RUN_TYPE_ORDER,
  formatKm,
  localDateString,
  parseLocalDate,
  weekKey,
  type CombinedWeekSummary,
} from '../domain/run';

interface Props {
  weeks: Map<string, CombinedWeekSummary>;
  /** Week (Monday) that the chart period ends on, inclusive. */
  endWeekStart: string;
  count: number;
  onCountChange: (n: number) => void;
  firstDay: number;
}

const CHART_HEIGHT = 140;
/** At most this many x-axis date labels are shown. Labels are rotated 90° (see the `.chart-x-axis-col`
 * CSS), so each one only needs about one character's width rather than a whole "d/m" string's — the
 * chart still lives in a ~300px-wide side-panel column, so once there are many weeks we still thin
 * labels out (see `labeledIndices`) rather than render one under every single bar, just at a much
 * higher cap than a horizontal label would allow. */
const MAX_X_LABELS = 16;

function emptyWeek(key: string): CombinedWeekSummary {
  return { weekStart: key, totalKm: 0, runs: 0, byType: {}, actualKm: 0, isPlanned: false };
}

/** The date the week starting `weekStart` (a Monday) ends on — its Sunday — as "d/m" (e.g. "27/9"). */
function weekEndLabel(weekStart: string): string {
  const start = parseLocalDate(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${end.getDate()}/${end.getMonth() + 1}`;
}

/** Which of `count` columns (0-indexed, oldest to newest) get an x-axis label: all of them when there
 * are few enough to fit, otherwise `maxLabels` indices spread evenly across the full span (always
 * including both the oldest week and the current one), so labels never land right next to each other. */
function labeledIndices(count: number, maxLabels = MAX_X_LABELS): Set<number> {
  if (count <= maxLabels) return new Set(Array.from({ length: count }, (_, i) => i));
  const set = new Set<number>();
  for (let i = 0; i < maxLabels; i++) set.add(Math.round((i * (count - 1)) / (maxLabels - 1)));
  return set;
}

export default function MileageChart({ weeks, endWeekStart, count, onCountChange, firstDay }: Props) {
  const period = useMemo(() => {
    const end = parseLocalDate(endWeekStart);
    const out: CombinedWeekSummary[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i * 7);
      const key = localDateString(d);
      out.push(weeks.get(key) ?? emptyWeek(key));
    }
    return out;
  }, [weeks, endWeekStart, count]);

  const max = Math.max(...period.map((w) => w.totalKm), 1);
  const gridlines = [0.25, 0.5, 0.75, 1];
  const shownLabels = useMemo(() => labeledIndices(period.length), [period.length]);

  return (
    <section className="chart-card">
      <div className="chart-head">
        <span className="label title">Weekly mileage</span>
        <div className="weeks-input">
          <span>last</span>
          <div className="weeks-stepper">
            <button type="button" onClick={() => onCountChange(Math.max(4, count - 1))} disabled={count <= 4} aria-label="Fewer weeks">
              −
            </button>
            <span className="weeks-value">{count}</span>
            <button type="button" onClick={() => onCountChange(Math.min(52, count + 1))} disabled={count >= 52} aria-label="More weeks">
              +
            </button>
          </div>
          <span>weeks</span>
        </div>
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
              <div
                key={w.weekStart}
                className="chart-bar-col"
                title={`${w.weekStart}: ${formatKm(w.totalKm)} km, ${w.runs} run${w.runs === 1 ? '' : 's'}${w.isPlanned ? ' (incl. planned)' : ''}`}
              >
                <div className={`chart-bar ${isCurrent ? 'current' : ''}`} style={{ height: `${(w.totalKm / max) * 100}%` }}>
                  {RUN_TYPE_ORDER.filter((t) => w.byType[t]).map((t) => (
                    <span
                      key={t}
                      className="chart-seg"
                      style={{ height: `${((w.byType[t] ?? 0) / (w.totalKm || 1)) * 100}%`, background: RUN_TYPES[t].color }}
                    />
                  ))}
                  {w.actualKm > 0 && (
                    <span className="chart-seg" style={{ height: `${(w.actualKm / (w.totalKm || 1)) * 100}%`, background: ACTUAL_COLOR }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="chart-x-axis">
        {period.map((w, i) => (
          <div key={w.weekStart} className="chart-x-axis-col">
            {shownLabels.has(i) && <span>{weekEndLabel(w.weekStart)}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
