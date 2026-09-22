import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ACTUAL_COLOR, ACTUAL_TEXT_COLOR, RUN_TYPES, buildTitle, formatKm, localDateString, parseLocalDate, totalDistanceKm, weekKey, type DayEntries, type Run } from '../domain/run';
import type { StravaActivity } from '../lib/strava';

interface Props {
  dayEntries: Map<string, DayEntries>;
  firstDay: number;
  onSelectDate: (date: string) => void;
  onSelectRun: (run: Run) => void;
  onSelectActivity: (activity: StravaActivity) => void;
  /** Called with the week currently nearest the vertical center of the visible scroll area. */
  onVisibleWeekChange?: (weekStart: string) => void;
}

export interface CalendarViewHandle {
  /** Scrolls back so today's row is centered in the view. */
  scrollToToday: () => void;
}

const CHUNK = 8; // weeks added per scroll extension
const INITIAL_BACK = 16;
const INITIAL_FORWARD = 12;
const EDGE_PX = 500;

function addWeeks(weekStart: string, n: number): string {
  const d = parseLocalDate(weekStart);
  d.setDate(d.getDate() + n * 7);
  return localDateString(d);
}

const weekdayFmt = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short' });
const monthFmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });

/**
 * A continuously scrollable grid of week rows (unlike FullCalendar's month view, which pages one
 * calendar month at a time). Starts centered on the current week and grows in either direction as
 * you scroll, so you can drift from the end of one month into the next without a "next month" click.
 */
const RollingCalendar = forwardRef<CalendarViewHandle, Props>(function RollingCalendar(
  { dayEntries, firstDay, onSelectDate, onSelectRun, onSelectActivity, onVisibleWeekChange },
  ref,
) {
  const todayWeekKey = useMemo(() => weekKey(new Date(), firstDay), [firstDay]);
  const todayStr = useMemo(() => localDateString(new Date()), []);
  const [weeks, setWeeks] = useState<string[]>(() => {
    const out: string[] = [];
    for (let i = -INITIAL_BACK; i <= INITIAL_FORWARD; i++) out.push(addWeeks(todayWeekKey, i));
    return out;
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const centeredRef = useRef(false);

  function centerOnWeek(weekStart: string, smooth: boolean) {
    const container = scrollRef.current;
    const row = container?.querySelector<HTMLElement>(`[data-week="${weekStart}"]`);
    if (!container || !row) return;
    // Based on actual rendered rects (not offsetTop, which is relative to the nearest positioned
    // ancestor rather than this scroll container and can drift by a few px over many rows) so the
    // row lands exactly centered regardless of how much content sits above the scroll container.
    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const delta = rowRect.top - containerRect.top - (container.clientHeight / 2 - rowRect.height / 2);
    const top = container.scrollTop + delta;
    container.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    onVisibleWeekChange?.(weekStart);
  }

  useImperativeHandle(ref, () => ({ scrollToToday: () => centerOnWeek(todayWeekKey, true) }), [todayWeekKey]);

  useLayoutEffect(() => {
    if (centeredRef.current) return;
    centerOnWeek(todayWeekKey, false);
    centeredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayWeekKey, weeks, onVisibleWeekChange]);

  const lastReportedWeek = useRef<string | null>(null);
  function reportVisibleWeek() {
    const c = scrollRef.current;
    if (!c || !onVisibleWeekChange) return;
    // Rendered rects, not offsetTop (which is relative to the nearest positioned ancestor, not this
    // scroll container, and would otherwise mismatch the container's own scroll-relative center).
    const containerRect = c.getBoundingClientRect();
    const centerY = containerRect.top + containerRect.height / 2;
    let closest: { week: string; dist: number } | null = null;
    for (const row of c.querySelectorAll<HTMLElement>('[data-week]')) {
      const rowRect = row.getBoundingClientRect();
      const mid = rowRect.top + rowRect.height / 2;
      const dist = Math.abs(mid - centerY);
      if (!closest || dist < closest.dist) closest = { week: row.dataset.week!, dist };
    }
    if (closest && closest.week !== lastReportedWeek.current) {
      lastReportedWeek.current = closest.week;
      onVisibleWeekChange(closest.week);
    }
  }

  function onScroll() {
    reportVisibleWeek();
    const c = scrollRef.current;
    if (!c) return;
    if (c.scrollTop < EDGE_PX) {
      const prevHeight = c.scrollHeight;
      setWeeks((w) => {
        const first = w[0];
        const more: string[] = [];
        for (let i = CHUNK; i >= 1; i--) more.push(addWeeks(first, -i));
        return [...more, ...w];
      });
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop += scrollRef.current.scrollHeight - prevHeight;
      });
    } else if (c.scrollHeight - c.scrollTop - c.clientHeight < EDGE_PX) {
      setWeeks((w) => {
        const last = w[w.length - 1];
        const more: string[] = [];
        for (let i = 1; i <= CHUNK; i++) more.push(addWeeks(last, i));
        return [...w, ...more];
      });
    }
  }

  const weekdayLabels = useMemo(() => {
    const start = parseLocalDate(weeks[0] ?? todayWeekKey);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return weekdayFmt(d);
    });
  }, [weeks, todayWeekKey]);

  return (
    <div className="rolling-cal">
      <div className="rolling-cal-head">
        {weekdayLabels.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
      <div className="rolling-cal-body" ref={scrollRef} onScroll={onScroll}>
        {weeks.map((weekStart) => (
          <WeekRow
            key={weekStart}
            weekStart={weekStart}
            todayStr={todayStr}
            dayEntries={dayEntries}
            onSelectDate={onSelectDate}
            onSelectRun={onSelectRun}
            onSelectActivity={onSelectActivity}
          />
        ))}
      </div>
    </div>
  );
});

export default RollingCalendar;

function WeekRow({
  weekStart,
  todayStr,
  dayEntries,
  onSelectDate,
  onSelectRun,
  onSelectActivity,
}: {
  weekStart: string;
  todayStr: string;
  dayEntries: Map<string, DayEntries>;
  onSelectDate: (date: string) => void;
  onSelectRun: (run: Run) => void;
  onSelectActivity: (activity: StravaActivity) => void;
}) {
  const start = parseLocalDate(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  return (
    <div className="rolling-week" data-week={weekStart}>
      {days.map((d) => {
        const dateStr = localDateString(d);
        const entry = dayEntries.get(dateStr);
        const isToday = dateStr === todayStr;
        const showMonth = d.getDate() === 1;
        return (
          <div key={dateStr} className={`rolling-day ${isToday ? 'today' : ''}`} onClick={() => onSelectDate(dateStr)}>
            <div className="rolling-day-num">{showMonth ? `${monthFmt(d)} ${d.getDate()}` : d.getDate()}</div>
            <div className="rolling-pills">
              {entry?.actual.map((a) => (
                <button
                  key={`a${a.id}`}
                  type="button"
                  className="pill actual"
                  style={{ background: ACTUAL_COLOR, color: ACTUAL_TEXT_COLOR }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectActivity(a);
                  }}
                  title={a.name}
                >
                  {formatKm(a.distanceKm)}k
                </button>
              ))}
              {entry?.planned.map((r) => (
                <button
                  key={`p${r.id ?? r.date}`}
                  type="button"
                  className="pill planned"
                  style={{ background: RUN_TYPES[r.type].color, color: RUN_TYPES[r.type].textColor }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRun(r);
                  }}
                  title={buildTitle(r.type, r.steps)}
                >
                  {formatKm(totalDistanceKm(r.steps))}k
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
