import { useMemo, useState } from 'react';
import { formatDuration, formatKm, formatPace, summarizeAverages } from '../domain/run';
import type { StravaActivity } from '../lib/strava';

interface Props {
  activities: StravaActivity[];
  firstDay: number;
}

const OPTIONS = [4, 12] as const;

/** Side-panel widget showing weekly averages (runs, distance, time, pace), toggle between last 4/12 weeks. */
export default function AverageStatsCard({ activities, firstDay }: Props) {
  const [weeksCount, setWeeksCount] = useState<(typeof OPTIONS)[number]>(12);
  const stats = useMemo(() => summarizeAverages(activities, firstDay, weeksCount), [activities, firstDay, weeksCount]);

  return (
    <section className="avg-stats">
      <div className="avg-stats-head">
        <span className="label">Weekly average</span>
        <div className="avg-stats-toggle">
          {OPTIONS.map((n) => (
            <button key={n} type="button" className={weeksCount === n ? 'active' : ''} onClick={() => setWeeksCount(n)}>
              {n}w
            </button>
          ))}
        </div>
      </div>
      <div className="avg-stats-rows">
        <div className="avg-stats-row">
          <span>Activities / week</span>
          <strong>{stats.avgRunsPerWeek.toFixed(1)}</strong>
        </div>
        <div className="avg-stats-row">
          <span>Distance / week</span>
          <strong>{formatKm(stats.avgKmPerWeek)} km</strong>
        </div>
        <div className="avg-stats-row">
          <span>Time / week</span>
          <strong>{stats.avgTimeSecPerWeek ? formatDuration(stats.avgTimeSecPerWeek) : '—'}</strong>
        </div>
        <div className="avg-stats-row">
          <span>Avg pace</span>
          <strong>{stats.avgPaceSecPerKm ? `${formatPace(stats.avgPaceSecPerKm)}/km` : '—'}</strong>
        </div>
      </div>
    </section>
  );
}
