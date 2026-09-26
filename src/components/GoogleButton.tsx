interface Props {
  signedIn: boolean;
  disabled?: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

/**
 * One segment of the topbar action toolbar for the Google connection — the counterpart to
 * StravaButton: a single-letter icon (not a text label) so the whole toolbar stays compact, with
 * the full meaning in the tooltip/aria-label. Highlighted (accent fill) when signed out — click to
 * sign in — plain once signed in, where clicking signs out. This is the only way to sign in now —
 * there is no separate sign-in landing page.
 */
export default function GoogleButton({ signedIn, disabled, onSignIn, onSignOut }: Props) {
  if (signedIn) {
    return (
      <button type="button" title="Sign out of Google" aria-label="Sign out of Google" onClick={onSignOut}>
        G
      </button>
    );
  }

  return (
    <button
      type="button"
      className="primary"
      disabled={disabled}
      title="Connect Google"
      aria-label="Connect Google"
      onClick={onSignIn}
    >
      G
    </button>
  );
}
