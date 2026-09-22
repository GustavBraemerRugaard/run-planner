import { STRAVA_CLIENT_ID, STRAVA_SCOPE, STRAVA_WORKER_URL } from '../config';

/**
 * Strava connection. Unlike Google's token flow, Strava's OAuth needs a client secret to exchange
 * or refresh tokens, so those two calls go through the small Cloudflare Worker in worker/ (it holds
 * the secret; see worker/src/index.js). Everything else — listing activities — is called directly
 * from the browser with the access token, same as Google.
 *
 * The refresh token is kept in localStorage so the connection survives reloads without asking you
 * to click through Strava's consent screen again (Strava has no silent-refresh popup like Google's).
 * Only the refresh token is persisted; the access token stays in memory and is renewed on demand.
 */

export class StravaError extends Error {}

const LS_REFRESH = 'strava_refresh_token';
const LS_ATHLETE = 'strava_athlete_name';

interface Tokens {
  accessToken: string;
  expiresAt: number; // ms epoch
}

let tokens: Tokens | null = null;

export function isConfigured(): boolean {
  return !STRAVA_CLIENT_ID.startsWith('PASTE_') && !STRAVA_WORKER_URL.startsWith('PASTE_');
}

export function isConnected(): boolean {
  return !!localStorage.getItem(LS_REFRESH);
}

export function athleteName(): string | null {
  return localStorage.getItem(LS_ATHLETE);
}

export function disconnect(): void {
  localStorage.removeItem(LS_REFRESH);
  localStorage.removeItem(LS_ATHLETE);
  tokens = null;
}

export function buildAuthorizeUrl(): string {
  const redirectUri = `${window.location.origin}${window.location.pathname}`;
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: STRAVA_SCOPE,
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number; // seconds epoch
  athlete?: { firstname?: string; lastname?: string };
}

async function callWorker(path: '/exchange' | '/refresh', body: Record<string, string>): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(`${STRAVA_WORKER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new StravaError('Could not reach the Strava connection worker. Check STRAVA_WORKER_URL and your connection.');
  }
  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) throw new StravaError((data as { error?: string }).error || `Strava connection error (${res.status})`);
  return data as TokenResponse;
}

function storeTokens(data: TokenResponse) {
  localStorage.setItem(LS_REFRESH, data.refresh_token);
  if (data.athlete) {
    const name = `${data.athlete.firstname ?? ''} ${data.athlete.lastname ?? ''}`.trim();
    if (name) localStorage.setItem(LS_ATHLETE, name);
  }
  tokens = { accessToken: data.access_token, expiresAt: data.expires_at * 1000 };
}

/**
 * Call once when the app loads: if the URL is a Strava OAuth redirect (?code=... or ?error=...),
 * completes the connection (or surfaces the error) and strips the query string from the URL either way.
 */
export async function handleRedirect(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  if (!code && !error) return;
  window.history.replaceState({}, '', window.location.pathname);
  if (error) throw new StravaError(`Strava sign-in was not completed (${error}).`);
  if (code) storeTokens(await callWorker('/exchange', { code }));
}

export async function getAccessToken(): Promise<string> {
  if (tokens && Date.now() < tokens.expiresAt - 30_000) return tokens.accessToken;
  const refreshToken = localStorage.getItem(LS_REFRESH);
  if (!refreshToken) throw new StravaError('Not connected to Strava.');
  const data = await callWorker('/refresh', { refresh_token: refreshToken });
  storeTokens(data);
  return tokens!.accessToken;
}

export interface StravaActivity {
  id: number;
  name: string;
  distanceKm: number;
  /** Local date the activity started, YYYY-MM-DD. */
  date: string;
  movingTimeSec: number;
}

interface RawActivity {
  id: number;
  name: string;
  distance: number; // meters
  moving_time: number; // seconds
  start_date_local?: string;
  start_date: string;
  type?: string;
  sport_type?: string;
}

/** Most recent activities, runs only, newest first. */
export async function listRecentActivities(count = 5): Promise<StravaActivity[]> {
  const token = await getAccessToken();
  let res: Response;
  try {
    res = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=${count}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new StravaError('Could not reach the Strava API. Check your connection.');
  }
  if (!res.ok) throw new StravaError(`Strava API error (${res.status})`);
  const items = (await res.json()) as RawActivity[];
  return items
    .filter((a) => a.type === 'Run' || a.sport_type === 'Run')
    .map((a) => ({
      id: a.id,
      name: a.name,
      distanceKm: a.distance / 1000,
      date: (a.start_date_local ?? a.start_date).slice(0, 10),
      movingTimeSec: a.moving_time,
    }));
}
