import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import type { DatesSetArg, EventClickArg, DateSelectArg, EventDropArg, EventInput } from '@fullcalendar/core';
import RunForm from './components/RunForm';
import ActiveWeekCard from './components/ActiveWeekCard';
import MileageChart from './components/MileageChart';
import StravaPanel from './components/StravaPanel';
import { CALENDAR_ID, DEFAULT_CHART_WEEKS, FIRST_DAY, GOOGLE_CLIENT_ID } from './config';
import { RUN_TYPES, buildTitle, fromEvent, localDateString, newStep, summarizeWeeks, toEventInput, weekKey, type Run } from './domain/run';
import { hasValidToken, signIn, signOut } from './lib/auth';
import { AuthError, deleteEvent, insertEvent, listEvents, patchEvent } from './lib/calendar';
import { handleRedirect as handleStravaRedirect } from './lib/strava';

const NARROW_PX = 700;
const isNarrow = () => window.innerWidth < NARROW_PX;
const notConfigured = GOOGLE_CLIENT_ID.startsWith('PASTE_') || CALENDAR_ID.startsWith('PASTE_');

function blankRun(date: string): Run {
  const description = '';
  return { type: 'easy', date, steps: [newStep('main')], description, autoDescription: description };
}

/** How far back/forward we need events for: the visible calendar range, widened to cover the chart period. */
function fetchRange(viewStart: Date, viewEnd: Date, chartWeeks: number): { start: Date; end: Date } {
  const chartStart = new Date();
  chartStart.setDate(chartStart.getDate() - (chartWeeks + 1) * 7);
  const start = viewStart < chartStart ? viewStart : chartStart;
  const end = viewEnd > new Date() ? viewEnd : new Date();
  return { start, end };
}

export default function App() {
  const [signedIn, setSignedIn] = useState(hasValidToken());
  const [runs, setRuns] = useState<Run[]>([]);
  const [viewRange, setViewRange] = useState<{ start: Date; end: Date } | null>(null);
  const [viewedWeekStart, setViewedWeekStart] = useState<string | null>(null);
  const [chartWeeks, setChartWeeks] = useState(DEFAULT_CHART_WEEKS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Run | null>(null);
  const [stravaVersion, setStravaVersion] = useState(0);
  const calRef = useRef<FullCalendar>(null);

  const handleError = useCallback((e: unknown) => {
    if (e instanceof AuthError) {
      setSignedIn(false);
      setError('Your Google session expired. Please sign in again.');
    } else {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const load = useCallback(async () => {
    if (!viewRange || !hasValidToken()) return;
    const { start, end } = fetchRange(viewRange.start, viewRange.end, chartWeeks);
    setLoading(true);
    try {
      const events = await listEvents(start, end);
      setRuns(events.filter((e) => e.start?.date).map(fromEvent));
      setError(null);
    } catch (e) {
      handleError(e);
    } finally {
      setLoading(false);
    }
  }, [viewRange, chartWeeks, handleError]);

  useEffect(() => {
    if (signedIn) void load();
  }, [signedIn, load]);

  // Completes the Strava connection if this page load is a redirect back from Strava's consent screen.
  // StravaPanel reads its connected/athlete state once on mount, so bump its key afterward to make it re-check.
  useEffect(() => {
    handleStravaRedirect()
      .then(() => setStravaVersion((v) => v + 1))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function onSignIn() {
    setError(null);
    try {
      await signIn();
      setSignedIn(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function onSignOut() {
    signOut();
    setSignedIn(false);
    setRuns([]);
  }

  const events: EventInput[] = useMemo(
    () =>
      runs.map((r) => {
        const next = new Date(`${r.date}T00:00`);
        next.setDate(next.getDate() + 1);
        return {
          id: r.id,
          title: buildTitle(r.type, r.steps),
          start: r.date,
          end: localDateString(next),
          allDay: true,
          backgroundColor: RUN_TYPES[r.type].color,
          borderColor: RUN_TYPES[r.type].color,
          extendedProps: { run: r },
        };
      }),
    [runs],
  );

  async function save(run: Run) {
    setSaving(true);
    try {
      const saved = fromEvent(run.id ? await patchEvent(run.id, toEventInput(run)) : await insertEvent(toEventInput(run)));
      setRuns((prev) => (run.id ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved]));
      setEditing(null);
      setError(null);
    } catch (e) {
      handleError(e);
    } finally {
      setSaving(false);
    }
  }

  async function remove(run: Run) {
    if (!run.id) return;
    setSaving(true);
    try {
      await deleteEvent(run.id);
      setRuns((prev) => prev.filter((r) => r.id !== run.id));
      setEditing(null);
      setError(null);
    } catch (e) {
      handleError(e);
    } finally {
      setSaving(false);
    }
  }

  // Drag to a new day: only the date changes, everything else about the run stays the same.
  async function onEventChange(info: EventDropArg) {
    const run = info.event.extendedProps.run as Run;
    const date = info.event.startStr.slice(0, 10);
    const updated: Run = { ...run, date };
    try {
      const saved = fromEvent(await patchEvent(run.id!, toEventInput(updated)));
      setRuns((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      setError(null);
    } catch (e) {
      info.revert();
      handleError(e);
    }
  }

  function onSelect(sel: DateSelectArg) {
    setEditing(blankRun(sel.startStr.slice(0, 10)));
    calRef.current?.getApi().unselect();
  }

  function onDatesSet(arg: DatesSetArg) {
    setViewRange((prev) =>
      prev && prev.start.getTime() === arg.start.getTime() && prev.end.getTime() === arg.end.getTime()
        ? prev
        : { start: arg.start, end: arg.end },
    );
    // Week-shaped views (dayGridWeek / listWeek) drive the "active week" stat; a month view falls back
    // to the real current week, since a month has no single week to show mileage for.
    const isWeekView = arg.view.type.toLowerCase().includes('week');
    setViewedWeekStart(isWeekView ? weekKey(arg.view.currentStart, FIRST_DAY) : null);
  }

  const weeklySummaries = useMemo(() => summarizeWeeks(runs, FIRST_DAY), [runs]);
  const todayWeekStart = weekKey(new Date(), FIRST_DAY);
  const activeWeekStart = viewedWeekStart ?? todayWeekStart;
  const activeWeek = weeklySummaries.get(activeWeekStart) ?? { weekStart: activeWeekStart, totalKm: 0, runs: 0, byType: {} };

  return (
    <div className="app">
      <header className="topbar">
        <h1>Run Planner</h1>
        <div className="topbar-actions">
          {signedIn && (
            <>
              <button className="btn primary" onClick={() => setEditing(blankRun(localDateString(new Date())))}>
                + Add run
              </button>
              <button className="btn" onClick={() => void load()} disabled={loading}>
                {loading ? 'Loading…' : 'Refresh'}
              </button>
              <button className="btn" onClick={onSignOut}>
                Sign out
              </button>
            </>
          )}
        </div>
      </header>

      {notConfigured && (
        <div className="notice">
          Setup needed: open <code>src/config.ts</code> and paste in your Google Client ID and the ID of your “Løb” calendar
          (see README).
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}

      <StravaPanel key={stravaVersion} />

      {!signedIn ? (
        <main className="signin">
          <p>Sign in with Google to load and edit the runs in your “Løb” calendar.</p>
          <button className="btn primary big" onClick={() => void onSignIn()} disabled={notConfigured}>
            Sign in with Google
          </button>
          <p className="fine">Only calendar events are accessed, and only the Løb calendar is used. The sign-in lasts about an hour.</p>
        </main>
      ) : (
        <main>
          <div className="cal">
            <FullCalendar
              ref={calRef}
              plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
              initialView={isNarrow() ? 'listWeek' : 'dayGridWeek'}
              headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek,listWeek' }}
              buttonText={{ today: 'Today', month: 'Month', week: 'Week', list: 'List' }}
              firstDay={FIRST_DAY}
              weekNumbers
              height="auto"
              displayEventTime={false}
              editable
              selectable
              selectMirror
              longPressDelay={300}
              eventLongPressDelay={300}
              selectLongPressDelay={300}
              events={events}
              datesSet={onDatesSet}
              select={onSelect}
              eventClick={(arg: EventClickArg) => setEditing(arg.event.extendedProps.run as Run)}
              eventDrop={(a) => void onEventChange(a)}
            />
          </div>
          <div className="side">
            <ActiveWeekCard week={activeWeek} />
            <MileageChart weeks={weeklySummaries} endWeekStart={todayWeekStart} count={chartWeeks} onCountChange={setChartWeeks} firstDay={FIRST_DAY} />
          </div>
        </main>
      )}

      {editing && (
        <RunForm
          key={editing.id ?? 'new'}
          run={editing}
          saving={saving}
          onSave={(r) => void save(r)}
          onDelete={(r) => void remove(r)}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
