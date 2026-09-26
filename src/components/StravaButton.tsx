import { athleteName, buildAuthorizeUrl, disconnect, isConfigured } from '../lib/strava';

interface Props {
  connected: boolean;
  onDisconnected: () => void;
}

/**
 * A single topbar button for the Strava connection, sized the same as Refresh/Sign out: "Connect
 * Strava" when not connected, or the athlete's name (click to disconnect) when connected. Renders
 * nothing when Strava hasn't been set up yet (see the setup notice in App instead).
 */
export default function StravaButton({ connected, onDisconnected }: Props) {
  if (!isConfigured()) return null;

  if (connected) {
    return (
      <button
        type="button"
        className="btn"
        title="Disconnect Strava"
        onClick={() => {
          disconnect();
          onDisconnected();
        }}
      >
        {athleteName() ? `Strava · ${athleteName()}` : 'Strava'}
      </button>
    );
  }

  return (
    <button type="button" className="btn" onClick={() => (window.location.href = buildAuthorizeUrl())}>
      Connect Strava
    </button>
  );
}
