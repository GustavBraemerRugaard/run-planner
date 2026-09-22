import { GOOGLE_CLIENT_ID, GOOGLE_SCOPE } from '../config';

/**
 * Google sign-in (Google Identity Services, "token" flow).
 * The access token lives only in memory: reloading the page means signing in again.
 * That is deliberate — it keeps the token out of localStorage where injected scripts could read it.
 */

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type: string; message?: string }) => void;
          }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

let accessToken: string | null = null;
let expiresAt = 0;
let client: TokenClient | null = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;
let scriptPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load Google sign-in. Check your connection.'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function hasValidToken(): boolean {
  return !!accessToken && Date.now() < expiresAt - 30_000;
}

export function getToken(): string | null {
  return hasValidToken() ? accessToken : null;
}

/** Must be called from a user gesture (button tap) so the browser allows the sign-in popup. */
export async function signIn(): Promise<string> {
  await loadGis();
  if (!client) {
    client = window.google!.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPE,
      callback: (r) => {
        if (r.access_token) {
          accessToken = r.access_token;
          expiresAt = Date.now() + (r.expires_in ?? 3600) * 1000;
          pending?.resolve(r.access_token);
        } else {
          pending?.reject(new Error(r.error_description || r.error || 'Sign-in failed'));
        }
        pending = null;
      },
      error_callback: (e) => {
        pending?.reject(new Error(e.type === 'popup_closed' ? 'Sign-in was cancelled.' : e.message || e.type));
        pending = null;
      },
    });
  }
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    client!.requestAccessToken({ prompt: hasValidToken() ? '' : undefined });
  });
}

export function signOut(): void {
  const t = accessToken;
  accessToken = null;
  expiresAt = 0;
  if (t && window.google) window.google.accounts.oauth2.revoke(t);
}
