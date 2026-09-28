import {
  ACTUAL_COLOR,
  ACTUAL_TEXT_COLOR,
  RUN_TYPES,
  RUN_TYPE_ORDER,
  formatKm,
  parseLocalDate,
  type RunFormWeekContext,
  type TrainingLoad,
  type WeekEntry,
} from '../domain/run';
import TrainingLoadGauge from './TrainingLoadGauge';

interface Props {
  context: RunFormWeekContext;
  /** What the run currently being edited/added would do to the acute:chronic training-load ratio if
   * saved as currently edited (computed "as of" its own date, draft folded in) — shown as a gauge below
   * the timeline so the panel answers not just "what's around this run" but "what would saving it do". */
  draftLoad: TrainingLoad;
  /** Desktop only: pixel height of the sibling run-form box to match exactly (scrolling internally
   * if this panel's own content is taller), so the two boxes always end at the same edge instead of
   * the shorter one stretching to fill the taller one's height. Undefined below that breakpoint. */
  matchHeight?: number;
}

const weekdayFmt = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2);

/** This day's displayed km and color: actual wins over planned when both exist — the same rule the
 * domain layer uses for its own day/week totals, so the strip's numbers always agree with the stats
 * above it. Returns null for a rest day (nothing planned or done). */
function primaryEntry(entries: WeekEntry[]): { km: number; color: string; textColor: string } | null {
  if (entries.length === 0) return null;
  const actual = entries.filter((e) => e.kind === 'actual');
  const source = actual.length > 0 ? actual : entries;
  const km = source.reduce((sum, e) => sum + e.km, 0);
  const rep = source.find((e) => e.isDraft) ?? source[0];
  return rep.kind === 'actual'
    ? { km, color: ACTUAL_COLOR, textColor: ACTUAL_TEXT_COLOR }
    : { km, color: RUN_TYPES[rep.runType!].color, textColor: RUN_TYPES[rep.runType!].textColor };
}

/** One day in the compact 7-wide week strip: a date number, plus — if anything happened that day — a
 * small colored pill with its km (actual-run orange, or the planned run's type color). A day with
 * nothing planned or done renders as a bare, muted date number ("rest day" readable at a glance without
 * needing a separate label or row); it still gets a `.hovertip-host` wrapper (harmless — with no
 * `.hovertip` child inside, `:hover` has nothing to reveal) rather than branching the markup, since a
 * rest day never has entries to show anyway.
 *
 * The hover tooltip (one row per entry, since a day can have more than one — an actual run plus the run
 * currently being edited on the same date, say — and the compact pill only has room for one number) is
 * the full detail the pill alone can't show. */
function StripCell({ date, entries, isDraftDate }: { date: string; entries: WeekEntry[]; isDraftDate: boolean }) {
  const primary = primaryEntry(entries);
  return (
    <div className={`form-context-cell hovertip-host ${isDraftDate ? 'draft' : ''}`}>
      <span className="form-context-cell-date">{parseLocalDate(date).getDate()}</span>
      {primary && (
        <span className="form-context-cell-pill" style={{ background: primary.color, color: primary.textColor }}>
          {formatKm(primary.km)}k
        </span>
      )}
      {entries.length > 0 && (
        <span className="hovertip">
          {entries.map((e, i) => (
            <span className="hovertip-row" key={i}>
              <span className="hovertip-key">
                {e.label}
                {e.isDraft ? ' (editing)' : ''}
              </span>
              <span className="hovertip-value">{formatKm(e.km)}k</span>
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

/**
 * Adjacent panel shown next to the run-editing form: this week's total distance and trailing 7-day
 * rolling total, this week's run-type mix, and a single continuous previous-week/this-week timeline —
 * so you can see how the run you're adding or editing fits into the surrounding period.
 *
 * The two weeks share one "Previous 2 weeks" label and one weekday-letter header (both strips use the
 * same weekday columns) — a single declaration of what the timeline is, rather than each week repeating
 * its own "Mon Tue Wed…" header and being listed as 7 separate text rows, or a divider line between the
 * two strips (the date numbers alone, increasing top to bottom, already read as chronological). That
 * duplication was the main source of the panel feeling dense/hard to scan. Each day is a compact colored
 * cell (a mini heatmap) instead of a label + km text row, so a fortnight's pattern of run days vs. rest
 * days reads in one glance; hover a cell for the full label(s).
 *
 * Below the timeline, a training-load gauge (`TrainingLoadGauge`, shared with `ActiveWeekCard`) shows
 * what saving this run would do to the acute:chronic ratio — forward-looking context this panel didn't
 * have before, added when the panel's own height stopped naturally matching the form panel's height
 * (see `matchHeight` below) and there was room to fill with something more useful than blank space.
 */
export default function RunContextPanel({ context, draftLoad, matchHeight }: Props) {
  const byDate = (entries: WeekEntry[]) => {
    const map = new Map<string, WeekEntry[]>();
    for (const e of entries) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  };
  const prevByDate = byDate(context.prevWeekEntries);
  const currentByDate = byDate(context.currentWeekEntries);
  const maxType = Math.max(1, ...RUN_TYPE_ORDER.map((t) => context.currentWeekByType[t] ?? 0));

  return (
    <div className="form-context" style={matchHeight ? { height: matchHeight, maxHeight: matchHeight } : undefined}>
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

      <div className="form-context-timeline">
        <span className="label">Previous 2 weeks</span>

        <div className="form-context-weekdays">
          {context.currentWeekDates.map((d) => (
            <span key={d}>{weekdayFmt(parseLocalDate(d))}</span>
          ))}
        </div>

        <div className="form-context-strip">
          {context.prevWeekDates.map((d) => (
            <StripCell key={d} date={d} entries={prevByDate.get(d) ?? []} isDraftDate={false} />
          ))}
        </div>

        <div className="form-context-strip">
          {context.currentWeekDates.map((d) => (
            <StripCell
              key={d}
              date={d}
              entries={currentByDate.get(d) ?? []}
              isDraftDate={currentByDate.get(d)?.some((e) => e.isDraft) ?? false}
            />
          ))}
        </div>
      </div>

      <TrainingLoadGauge
        load={draftLoad}
        tooltip="Acute:chronic workload ratio if this run is saved as currently edited — a directional injury-risk signal, not a diagnosis."
      />
    </div>
  );
}
