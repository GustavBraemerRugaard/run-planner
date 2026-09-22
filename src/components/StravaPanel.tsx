import { useState } from 'react';
import { formatKm } from '../domain/run';
import {
  athleteName,
  buildAuthorizeUrl,
  disconnect,
  isConfigured,
  isConnected,
  listRecentActivities,
  type StravaActivity,
} from '../lib/strava';

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

/**
 * Minimal, standalone proof that the Strava connection works: connect/disconnect, and a manual
 * "Load recent activities" fetch. Not wired into the calendar yet — that comes once the connection
 * itself is solid.
 */
export default function StravaPanel() {
  const [connected, setConnected] = useState(isConnected());
  const [activities, setActivities] = useState<StravaActivity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isConfigured()) {
    return (
      <section className="strava-panel">
        <span className="label">Strava</span>
        <p className="fine">
          Not set up yet: fill in <code>STRAVA_CLIENT_ID</code> and <code>STRAVA_WORKER_URL</code> in{' '}
          <code>src/config.ts</code> (see README, "Strava setup").
        </p>
      </section>
    );
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setActivities(await listRecentActivities(5));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="strava-panel">
      <div className="strava-head">
        <span className="label">Strava</span>
        {connected ? (
          <button
            type="button"
            className="btn small"
            onClick={() => {
              disconnect();
              setConnected(false);
              setActivities(null);
            }}
          >
            Disconnect
          </button>
        ) : (
          <button type="button" className="btn small primary" onClick={() => (window.location.href = buildAuthorizeUrl())}>
            Connect Strava
          </button>
        )}
      </div>

      {connected && (
        <>
          <p className="fine">Connected{athleteName() ? ` as ${athleteName()}` : ''}.</p>
          <button type="button" className="btn small" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Load recent activities'}
          </button>
          {error && (
            <p className="fine error" role="alert">
              {error}
            </p>
          )}
          {activities && (
            <ul className="strava-activities">
              {activities.length === 0 && <li className="fine">No recent runs found.</li>}
              {activities.map((a) => (
                <li key={a.id}>
                  <span className="strava-date">{a.date}</span>
                  <span className="strava-name">{a.name}</span>
                  <span className="strava-stats">
                    {formatKm(a.distanceKm)} km · {formatDuration(a.movingTimeSec)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
