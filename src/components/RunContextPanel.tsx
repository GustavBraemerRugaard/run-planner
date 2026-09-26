import { ACTUAL_COLOR, RUN_TYPES, RUN_TYPE_ORDER, formatKm, parseLocalDate, type RunFormWeekContext, type WeekEntry } from '../domain/run';

interface Props {
  context: RunFormWeekContext;
  /** Desktop only: pixel height of the sibling run-form box to match exactly (scrolling internally
   * if this panel's own content is taller), so the two boxes always end at the same edge instead of
   * the shorter one stretching to fill the taller one's height. Undefined below that breakpoint. */
  matchHeight?: number;
}

const dayFmt = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** One day's row: the date, and every run (planned or done) on it, or a muted "rest day" placeholder. */
function DayRow({ date, entries, isDraftDate }: { date: string; entries: WeekEntry[]; isDraftDate: boolean }) {
  return (
    <div className={`form-context-day ${isDraftDate ? 'current' : ''}`}>
      <div className="form-context-day-date">{dayFmt(parseLocalDate(date))}</div>
      {entries.length === 0 ? (
        <div className="form-context-entry empty">—</div>
      ) : (
        entries.map((e, i) => (
          <div key={i} className={`form-context-entry ${e.isDraft ? 'draft' : ''}`}>
            <span
              className="form-context-dot"
              style={{ background: e.kind === 'actual' ? ACTUAL_COLOR : RUN_TYPES[e.runType!].color }}
            />
            <span className="form-context-label">
              {e.label}
              {e.isDraft && ' (editing)'}
            </span>
            <span className="form-context-km">{formatKm(e.km)}k</span>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Adjacent panel shown next to the run-editing form: the previous and current week's planned/actual
 * runs, this week's total distance, the trailing 7-day rolling total, and this week's run-type mix —
 * so you can see how the run you're adding or editing fits into the surrounding period.
 */
export default function RunContextPanel({ context, matchHeight }: Props) {
  const byDate = (entries: WeekEntry[]) => {
    const map = new Map<string, WeekEntry[]>();
    for (const e of entries) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  };
  const prevByDate = byDate(context.prevWeekEntries);
  const currentByDate = byDate(context.currentWeekEntries);
  const maxType = Math.max(1, ...RUN_TYPE_ORDER.map((t) => context.currentWeekByType[t] ?? 0));

  return (
    <div className="form-context" style={matchHeight ? { maxHeight: matchHeight } : undefined}>
      <div className="form-context-stats">
        <div>
          <span className="label">This week</span>
          <strong>{formatKm(context.currentWeekTotalKm)} km</strong>
        </div>
        <div>
          <span className="label">Rolling 7 days</span>
          <strong>{formatKm(context.rolling7DayKm)} km</strong>
        </div>
      </div>

      {RUN_TYPE_ORDER.some((t) => context.currentWeekByType[t]) && (
        <div className="form-context-types">
          <span className="label">This week's mix</span>
          <div className="form-context-type-rows">
            {RUN_TYPE_ORDER.filter((t) => context.currentWeekByType[t]).map((t) => (
              <div key={t} className="form-context-type-row">
                <span className="form-context-type-label">{RUN_TYPES[t].label}</span>
                <div className="bar">
                  <span
                    className="bar-seg"
                    style={{ width: `${((context.currentWeekByType[t] ?? 0) / maxType) * 100}%`, background: RUN_TYPES[t].color }}
                  />
                </div>
                <span className="form-context-type-km">{formatKm(context.currentWeekByType[t] ?? 0)}k</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="form-context-week">
        <span className="label">Previous week</span>
        {context.prevWeekDates.map((d) => (
          <DayRow key={d} date={d} entries={prevByDate.get(d) ?? []} isDraftDate={false} />
        ))}
      </div>

      <div className="form-context-week">
        <span className="label">This week</span>
        {context.currentWeekDates.map((d) => (
          <DayRow key={d} date={d} entries={currentByDate.get(d) ?? []} isDraftDate={currentByDate.get(d)?.some((e) => e.isDraft) ?? false} />
        ))}
      </div>
    </div>
  );
}
