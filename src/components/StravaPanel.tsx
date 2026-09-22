import { athleteName, buildAuthorizeUrl, disconnect, isConfigured, isConnected } from '../lib/strava';

interface Props {
  connected: boolean;
  loading: boolean;
  onDisconnected: () => void;
}

/** Connect/disconnect only — the actual Strava data shows up in the calendar, latest-run card and weekly history. */
export default function StravaPanel({ connected, loading, onDisconnected }: Props) {
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

  return (
    <section className="strava-panel">
      <div className="strava-head">
        <span className="label">Strava{connected && athleteName() ? ` · ${athleteName()}` : ''}</span>
        {connected ? (
          <button
            type="button"
            className="btn small"
            onClick={() => {
              disconnect();
              onDisconnected();
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
      {connected && loading && <p className="fine">Loading your last 6 months of runs…</p>}
      {!connected && isConnected() && <p className="fine">Reconnecting…</p>}
    </section>
  );
}
