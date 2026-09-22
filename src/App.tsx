import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RunForm from './components/RunForm';
import ActiveWeekCard from './components/ActiveWeekCard';
import MileageChart from './components/MileageChart';
import StravaPanel from './components/StravaPanel';
import RollingCalendar, { type CalendarViewHandle } from './components/RollingCalendar';
import ListView from './components/ListView';
import ActivityDetail from './components/ActivityDetail';
import LatestRunCard from './components/LatestRunCard';
import WeeklyHistoryList from './components/WeeklyHistoryList';
import AverageStatsCard from './components/AverageStatsCard';
import { CALENDAR_ID, DEFAULT_CHART_WEEKS, FIRST_DAY, GOOGLE_CLIENT_ID } from './config';
import {
  buildDayEntries,
  fromEvent,
  localDateString,
  newStep,
  summarizeActualWeeks,
  summarizeCombinedWeeks,
  toEventInput,
  weekKey,
  type CombinedWeekSummary,
  type Run,
} from './domain/run';
import { hasValidToken, signIn, signOut } from './lib/auth';
import { AuthError, deleteEvent, insertEvent, listEvents, patchEvent } from './lib/calendar';
import {
  handleRedirect as handleStravaRedirect,
  isConnected as isStravaConnected,
  listActivities,
  type StravaActivity,
} from './lib/strava';

type ViewMode = 'list' | 'month';

const NARROW_PX = 700;
const isNarrow = () => window.innerWidth < NARROW_PX;
const notConfigured = GOOGLE_CLIENT_ID.startsWith('PASTE_') || CALENDAR_ID.startsWith('PASTE_');
const GOOGLE_PAST_MONTHS = 6;
const GOOGLE_FUTURE_MONTHS = 3;
const STRAVA_MONTHS_BACK = 6;

function blankRun(date: string): Run {
  const description = '';
  return { type: 'easy', date, steps: [newStep('main')], description, autoDescription: description };
}

function emptyCombinedWeek(weekStart: string): CombinedWeekSummary {
  return { weekStart, totalKm: 0, runs: 0, byType: {}, actualKm: 0, isPlanned: false };
}

export default function App() {
  const [signedIn, setSignedIn] = useState(hasValidToken());
  const [runs, setRuns] = useState<Run[]>([]);
  const [stravaConnected, setStravaConnected] = useState(isStravaConnected());
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(() => (isNarrow() ? 'list' : 'month'));
  const [chartWeeks, setChartWeeks] = useState(DEFAULT_CHART_WEEKS);
  const [loading, setLoading] = useState(false);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Run | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<StravaActivity | null>(null);
  const [activeWeekStart, setActiveWeekStart] = useState<string | null>(null);
  const calendarRef = useRef<CalendarViewHandle | null>(null);

  const handleError = useCallback((e: unknown) => {
    if (e instanceof AuthError) {
      setSignedIn(false);
      setError('Your Google session expired. Please sign in again.');
    } else {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const load = useCallback(async () => {
    if (!hasValidToken()) return;
    setLoading(true);
    try {
      const now = new Date();
      const start = new Date(now);
      start.setMonth(start.getMonth() - GOOGLE_PAST_MONTHS);
      const end = new Date(now);
      end.setMonth(end.getMonth() + GOOGLE_FUTURE_MONTHS);
      const events = await listEvents(start, end);
      setRuns(events.filter((e) => e.start?.date).map(fromEvent));
      setError(null);
    } catch (e) {
      handleError(e);
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  const loadStrava = useCallback(async () => {
    if (!isStravaConnected()) return;
    setActivitiesLoading(true);
    try {
      setActivities(await listActivities(STRAVA_MONTHS_BACK));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActivitiesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (signedIn) void load();
  }, [signedIn, load]);

  useEffect(() => {
    if (stravaConnected) void loadStrava();
  }, [stravaConnected, loadStrava]);

  // Completes the Strava connection if this page load is a redirect back from Strava's consent screen.
  useEffect(() => {
    handleStravaRedirect()
      .then(() => setStravaConnected(isStravaConnected()))
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

  function refresh() {
    void load();
    if (stravaConnected) void loadStrava();
  }

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

  const dayEntries = useMemo(() => buildDayEntries(runs, activities), [runs, activities]);
  const combinedWeeks = useMemo(() => summarizeCombinedWeeks(runs, activities, FIRST_DAY), [runs, activities]);
  const actualWeeks = useMemo(() => summarizeActualWeeks(activities, FIRST_DAY), [activities]);
  const latestActivity = activities[0] ?? null;

  const todayWeekStart = weekKey(new Date(), FIRST_DAY);
  const shownWeekStart = activeWeekStart ?? todayWeekStart;
  const activeWeek = combinedWeeks.get(shownWeekStart) ?? emptyCombinedWeek(shownWeekStart);

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
              <button className="btn" onClick={refresh} disabled={loading || activitiesLoading}>
                {loading || activitiesLoading ? 'Loading…' : 'Refresh'}
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

      <StravaPanel
        connected={stravaConnected}
        loading={activitiesLoading}
        onDisconnected={() => {
          setStravaConnected(false);
          setActivities([]);
        }}
      />

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
          <div className="cal-col">
            <div className="cal">
              <div className="cal-toolbar">
                <h2 className="cal-title">Calendar</h2>
                <div className="cal-toolbar-actions">
                  <button type="button" className="btn small" onClick={() => calendarRef.current?.scrollToToday()}>
                    Today
                  </button>
                  <div className="view-toggle">
                    <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')}>
                      List
                    </button>
                    <button className={viewMode === 'month' ? 'active' : ''} onClick={() => setViewMode('month')}>
                      Month
                    </button>
                  </div>
                </div>
              </div>
              {viewMode === 'month' ? (
                <RollingCalendar
                  ref={calendarRef}
                  dayEntries={dayEntries}
                  firstDay={FIRST_DAY}
                  onSelectDate={(date) => setEditing(blankRun(date))}
                  onSelectRun={(run) => setEditing(run)}
                  onSelectActivity={(a) => setSelectedActivity(a)}
                  onVisibleWeekChange={setActiveWeekStart}
                />
              ) : (
                <ListView
                  ref={calendarRef}
                  dayEntries={dayEntries}
                  firstDay={FIRST_DAY}
                  onSelectDate={(date) => setEditing(blankRun(date))}
                  onSelectRun={(run) => setEditing(run)}
                  onSelectActivity={(a) => setSelectedActivity(a)}
                  onVisibleWeekChange={setActiveWeekStart}
                />
              )}
            </div>
            <WeeklyHistoryList weeks={actualWeeks} firstDay={FIRST_DAY} />
          </div>
          <div className="side">
            <LatestRunCard activity={latestActivity} onSelect={setSelectedActivity} />
            <ActiveWeekCard week={activeWeek} />
            <AverageStatsCard activities={activities} firstDay={FIRST_DAY} />
            <MileageChart weeks={combinedWeeks} endWeekStart={todayWeekStart} count={chartWeeks} onCountChange={setChartWeeks} firstDay={FIRST_DAY} />
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

      {selectedActivity && <ActivityDetail activity={selectedActivity} onClose={() => setSelectedActivity(null)} />}
    </div>
  );
}
