import { useState } from 'react';
import {
  ACTUAL_COLOR,
  RUN_TYPES,
  buildTitle,
  formatKm,
  localDateString,
  trend,
  type CombinedWeekSummary,
  type DayEntries,
} from '../domain/run';
import type { StravaActivity } from '../lib/strava';

interface Props {
  dayEntries: Map<string, DayEntries>;
  thisWeek: CombinedWeekSummary;
  prevWeekTotalKm: number;
  goalKm: number | null;
  onSetGoal: (km: number | null) => void;
  onSelectActivity: (a: StravaActivity) => void;
  onSelectDate: (date: string) => void;
}

/**
 * The single "today / this week at a glance" surface: what's happening today, and how this week's
 * distance compares to a goal (or last week, if no goal is set). This is the same card used as the
 * desktop top strip and as the phone's "Today" tab — the one place meant to answer "where do things
 * stand right now" without hunting across the other widgets for it. The run-type breakdown lives on
 * the calendar itself, so it isn't duplicated here.
 */
export default function TodayCard({ dayEntries, thisWeek, prevWeekTotalKm, goalKm, onSetGoal, onSelectActivity, onSelectDate }: Props) {
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(goalKm != null ? String(goalKm) : '');

  const todayStr = localDateString(new Date());
  const today = dayEntries.get(todayStr);

  function submitGoal() {
    const n = parseFloat(goalInput.replace(',', '.'));
    onSetGoal(Number.isFinite(n) && n > 0 ? n : null);
    setEditingGoal(false);
  }

  let todayLine: { label: string; sub: string; onClick?: () => void; color: string } | null = null;
  if (today && today.actual.length > 0) {
    const a = today.actual[0];
    todayLine = { label: `Today: ${a.name}`, sub: `${formatKm(a.distanceKm)} km · done`, onClick: () => onSelectActivity(a), color: ACTUAL_COLOR };
  } else if (today && today.planned.length > 0) {
    const r = today.planned[0];
    todayLine = {
      label: `Today: ${buildTitle(r.type, r.steps)}`,
      sub: 'planned',
      onClick: () => onSelectDate(todayStr),
      color: RUN_TYPES[r.type].color,
    };
  } else {
    todayLine = { label: 'No run planned today', sub: '', color: 'transparent' };
  }

  const dir = goalKm == null ? trend(thisWeek.totalKm, prevWeekTotalKm) : null;
  const pct = goalKm ? Math.min(100, (thisWeek.totalKm / goalKm) * 100) : Math.min(100, (thisWeek.totalKm / (thisWeek.totalKm || 1)) * 100);

  return (
    <section className="today-card">
      <div className="today-main">
        <button type="button" className="today-line" onClick={todayLine?.onClick} disabled={!todayLine?.onClick}>
          <span className="today-dot" style={{ background: todayLine?.color }} />
          <span>
            <strong>{todayLine?.label}</strong>
            {todayLine?.sub && <span className="today-sub"> · {todayLine.sub}</span>}
          </span>
        </button>
      </div>

      <div className="today-week">
        <div className="today-week-head">
          <span className="label">This week</span>
          {!editingGoal && (
            <button
              type="button"
              className="btn small"
              onClick={() => {
                setGoalInput(goalKm != null ? String(goalKm) : '');
                setEditingGoal(true);
              }}
            >
              {goalKm != null ? 'Edit goal' : 'Set goal'}
            </button>
          )}
        </div>

        {editingGoal ? (
          <div className="today-goal-edit">
            <input
              inputMode="decimal"
              autoFocus
              placeholder="km"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitGoal()}
            />
            <span className="step-unit">km goal</span>
            <button type="button" className="btn small" onClick={submitGoal}>
              Save
            </button>
            {goalKm != null && (
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  onSetGoal(null);
                  setEditingGoal(false);
                }}
              >
                Clear
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="today-week-total">
              <strong>{formatKm(thisWeek.totalKm)} km</strong>
              {goalKm != null ? (
                <span className="today-sub"> of {formatKm(goalKm)} km goal</span>
              ) : (
                <span className="today-sub">
                  {' '}
                  · last week {formatKm(prevWeekTotalKm)} km
                  {dir === 'up' && ' ▲'}
                  {dir === 'down' && ' ▼'}
                </span>
              )}
            </div>
            <div className="bar today-bar">
              <span className="bar-seg" style={{ width: `${pct}%`, background: ACTUAL_COLOR }} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
