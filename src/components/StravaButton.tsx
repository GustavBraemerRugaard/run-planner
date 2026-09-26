import { athleteName, buildAuthorizeUrl, disconnect, isConfigured } from '../lib/strava';

interface Props {
  connected: boolean;
  onDisconnected: () => void;
}

/**
 * One segment of the topbar action toolbar for the Strava connection — the counterpart to
 * GoogleButton: a single-letter icon (not a text label) so the whole toolbar stays compact, with the
 * full meaning (and, once connected, who's connected) in the tooltip/aria-label. Highlighted (accent
 * fill) when not connected — click to connect — plain once connected, where clicking disconnects.
 * Renders nothing when Strava hasn't been set up yet (see the setup notice in App instead).
 */
export default function StravaButton({ connected, onDisconnected }: Props) {
  if (!isConfigured()) return null;

  if (connected) {
    const name = athleteName();
    return (
      <button
        type="button"
        title={name ? `Disconnect Strava (${name})` : 'Disconnect Strava'}
        aria-label={name ? `Disconnect Strava (${name})` : 'Disconnect Strava'}
        onClick={() => {
          disconnect();
          onDisconnected();
        }}
      >
        S
      </button>
    );
  }

  return (
    <button
      type="button"
      className="primary"
      title="Connect Strava"
      aria-label="Connect Strava"
      onClick={() => (window.location.href = buildAuthorizeUrl())}
    >
      S
    </button>
  );
}
