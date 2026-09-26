import { formatDuration, formatKm, formatPace } from '../domain/run';
import type { StravaActivity } from '../lib/strava';

interface Props {
  activity: StravaActivity | null;
  onSelect: (activity: StravaActivity) => void;
}

/**
 * The most recent Strava run and its key numbers, one click away from the full detail + laps.
 * Always renders all five metric slots (using "—" for ones the activity doesn't have) so they sit
 * in the same fixed position every time, with the last one flush with the date above.
 */
export default function LatestRunCard({ activity, onSelect }: Props) {
  if (!activity) {
    return (
      <section className="latest-run">
        <span className="label title">Latest run</span>
        <p className="fine">No Strava runs found yet.</p>
      </section>
    );
  }
  const when = new Date(`${activity.date}T${activity.time || '00:00'}`);
  return (
    <section className="latest-run" onClick={() => onSelect(activity)}>
      <div className="latest-run-head">
        <span className="label title">Latest run</span>
        <span className="fine">{when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
      </div>
      <div className="latest-run-name">{activity.name}</div>
      <div className="latest-run-stats">
        <div>
          <strong>{formatKm(activity.distanceKm)}</strong>
          <span>km</span>
        </div>
        <div>
          <strong>{formatDuration(activity.movingTimeSec)}</strong>
          <span>time</span>
        </div>
        <div>
          <strong>{activity.paceSecPerKm ? formatPace(activity.paceSecPerKm) : '—'}</strong>
          <span>/km</span>
        </div>
        <div>
          <strong>{activity.averageHeartRate != null ? Math.round(activity.averageHeartRate) : '—'}</strong>
          <span>bpm</span>
        </div>
        <div>
          <strong>{activity.averageCadenceSpm != null ? Math.round(activity.averageCadenceSpm) : '—'}</strong>
          <span>spm</span>
        </div>
      </div>
    </section>
  );
}
