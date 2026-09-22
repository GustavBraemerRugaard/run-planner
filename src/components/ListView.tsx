import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ACTUAL_COLOR, RUN_TYPES, buildTitle, formatKm, localDateString, parseLocalDate, totalDistanceKm, weekKey, type DayEntries, type Run } from '../domain/run';
import type { StravaActivity } from '../lib/strava';
import type { CalendarViewHandle } from './RollingCalendar';

interface Props {
  dayEntries: Map<string, DayEntries>;
  firstDay: number;
  onSelectDate: (date: string) => void;
  onSelectRun: (run: Run) => void;
  onSelectActivity: (activity: StravaActivity) => void;
  /** Called with the week of whichever day row is nearest the top of the visible list. */
  onVisibleWeekChange?: (weekStart: string) => void;
}

const INITIAL_BACK_DAYS = 120;
const INITIAL_FORWARD_DAYS = 60;
const CHUNK_DAYS = 60;
const EDGE_PX = 400;

function addDays(dateStr: string, n: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return localDateString(d);
}

const dateHeadFmt = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

/** A flat, chronological list of days that have something planned or actually run, centered on today. */
const ListView = forwardRef<CalendarViewHandle, Props>(function ListView(
  { dayEntries, firstDay, onSelectDate, onSelectRun, onSelectActivity, onVisibleWeekChange },
  ref,
) {
  const todayStr = useMemo(() => localDateString(new Date()), []);
  const [range, setRange] = useState(() => ({
    start: addDays(todayStr, -INITIAL_BACK_DAYS),
    end: addDays(todayStr, INITIAL_FORWARD_DAYS),
  }));
  const scrollRef = useRef<HTMLDivElement>(null);
  const centeredRef = useRef(false);

  const visibleDays = useMemo(() => {
    const out: string[] = [];
    let d = range.start;
    while (d <= range.end) {
      const e = dayEntries.get(d);
      if (d === todayStr || (e && (e.planned.length > 0 || e.actual.length > 0))) out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [range, dayEntries, todayStr]);

  function centerOnToday(smooth: boolean) {
    const container = scrollRef.current;
    const row = container?.querySelector<HTMLElement>(`[data-date="${todayStr}"]`);
    if (!container || !row) return;
    // Based on actual rendered rects (not offsetTop, which is relative to the nearest positioned
    // ancestor rather than this scroll container and can drift by a few px over many rows) so the
    // row lands exactly centered regardless of how much content sits above the scroll container.
    const containerRect = container.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const delta = rowRect.top - containerRect.top - (container.clientHeight / 2 - rowRect.height / 2);
    const top = container.scrollTop + delta;
    container.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    onVisibleWeekChange?.(weekKey(parseLocalDate(todayStr), firstDay));
  }

  useImperativeHandle(ref, () => ({ scrollToToday: () => centerOnToday(true) }), [todayStr, firstDay]);

  useLayoutEffect(() => {
    if (centeredRef.current) return;
    centerOnToday(false);
    centeredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStr, visibleDays, firstDay, onVisibleWeekChange]);

  const lastReportedWeek = useRef<string | null>(null);
  function reportVisibleWeek() {
    const c = scrollRef.current;
    if (!c || !onVisibleWeekChange) return;
    // Rendered rects, not offsetTop (which is relative to the nearest positioned ancestor, not this
    // scroll container, and would otherwise mismatch the container's own visible top edge).
    const containerTop = c.getBoundingClientRect().top;
    let nearest: { date: string; top: number } | null = null;
    for (const row of c.querySelectorAll<HTMLElement>('[data-date]')) {
      const rowTop = row.getBoundingClientRect().top;
      if (rowTop >= containerTop - 4 && (!nearest || rowTop < nearest.top)) {
        nearest = { date: row.dataset.date!, top: rowTop };
      }
    }
    if (nearest) {
      const week = weekKey(parseLocalDate(nearest.date), firstDay);
      if (week !== lastReportedWeek.current) {
        lastReportedWeek.current = week;
        onVisibleWeekChange(week);
      }
    }
  }

  function onScroll() {
    reportVisibleWeek();
    const c = scrollRef.current;
    if (!c) return;
    if (c.scrollTop < EDGE_PX) {
      const prevHeight = c.scrollHeight;
      setRange((r) => ({ ...r, start: addDays(r.start, -CHUNK_DAYS) }));
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop += scrollRef.current.scrollHeight - prevHeight;
      });
    } else if (c.scrollHeight - c.scrollTop - c.clientHeight < EDGE_PX) {
      setRange((r) => ({ ...r, end: addDays(r.end, CHUNK_DAYS) }));
    }
  }

  return (
    <div className="list-view" ref={scrollRef} onScroll={onScroll}>
      {visibleDays.map((date) => {
        const entry = dayEntries.get(date);
        const isToday = date === todayStr;
        const d = parseLocalDate(date);
        return (
          <div key={date} className={`list-day ${isToday ? 'today' : ''}`} data-date={date}>
            <div className="list-day-head" onClick={() => onSelectDate(date)}>
              {dateHeadFmt(d)}
              {isToday && <span className="list-today-badge">Today</span>}
            </div>
            <div className="list-day-entries">
              {entry?.actual.map((a) => (
                <button
                  key={`a${a.id}`}
                  type="button"
                  className="list-entry actual"
                  style={{ borderColor: ACTUAL_COLOR }}
                  onClick={() => onSelectActivity(a)}
                >
                  <span className="list-entry-dot" style={{ background: ACTUAL_COLOR }} />
                  <span className="list-entry-title">{a.name}</span>
                  <span className="list-entry-sub">{formatKm(a.distanceKm)} km · done</span>
                </button>
              ))}
              {entry?.planned.map((r) => (
                <button
                  key={`p${r.id ?? r.date}`}
                  type="button"
                  className="list-entry planned"
                  style={{ borderColor: RUN_TYPES[r.type].color }}
                  onClick={() => onSelectRun(r)}
                >
                  <span className="list-entry-dot" style={{ background: RUN_TYPES[r.type].color }} />
                  <span className="list-entry-title">{buildTitle(r.type, r.steps)}</span>
                  <span className="list-entry-sub">{formatKm(totalDistanceKm(r.steps))} km · planned</span>
                </button>
              ))}
              {!entry?.actual.length && !entry?.planned.length && (
                <span className="list-entry-empty" onClick={() => onSelectDate(date)}>
                  + Add run
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default ListView;
