import { STRAVA_CLIENT_ID, STRAVA_SCOPE, STRAVA_WORKER_URL } from '../config';

/**
 * Strava connection. Unlike Google's token flow, Strava's OAuth needs a client secret to exchange
 * or refresh tokens, so those two calls go through the small Cloudflare Worker in worker/ (it holds
 * the secret; see worker/src/index.js). Everything else — listing activities, activity detail, laps —
 * is called directly from the browser with the access token, same as Google.
 *
 * The refresh token is kept in localStorage so the connection survives reloads without asking you
 * to click through Strava's consent screen again (Strava has no silent-refresh popup like Google's).
 * Only the refresh token is persisted; the access token stays in memory and is renewed on demand.
 */

export class StravaError extends Error {}

const LS_REFRESH = 'strava_refresh_token';
const LS_ATHLETE = 'strava_athlete_name';
const API = 'https://www.strava.com/api/v3';

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

async function api<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new StravaError('Could not reach the Strava API. Check your connection.');
  }
  if (!res.ok) throw new StravaError(`Strava API error (${res.status})`);
  return res.json() as Promise<T>;
}

export interface StravaActivity {
  id: number;
  name: string;
  distanceKm: number;
  /** Local date the activity started, YYYY-MM-DD. */
  date: string;
  /** Local start time HH:MM, for sorting/display of same-day runs. */
  time: string;
  movingTimeSec: number;
  elapsedTimeSec: number;
  paceSecPerKm: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  /** Steps per minute (both feet) — Strava reports single-leg cadence, this is already doubled. */
  averageCadenceSpm: number | null;
}

interface RawActivity {
  id: number;
  name: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  average_speed: number; // m/s
  start_date_local?: string;
  start_date: string;
  type?: string;
  sport_type?: string;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
}

function fromRaw(a: RawActivity): StravaActivity {
  const local = (a.start_date_local ?? a.start_date) || '';
  return {
    id: a.id,
    name: a.name,
    distanceKm: a.distance / 1000,
    date: local.slice(0, 10),
    time: local.slice(11, 16),
    movingTimeSec: a.moving_time,
    elapsedTimeSec: a.elapsed_time,
    paceSecPerKm: a.average_speed > 0 ? 1000 / a.average_speed : null,
    averageHeartRate: a.average_heartrate ?? null,
    maxHeartRate: a.max_heartrate ?? null,
    averageCadenceSpm: a.average_cadence != null ? a.average_cadence * 2 : null,
  };
}

/** All runs (Run/TrailRun) from the last `monthsBack` months, newest first. */
export async function listActivities(monthsBack = 6): Promise<StravaActivity[]> {
  const after = Math.floor(Date.now() / 1000) - monthsBack * 30 * 24 * 3600;
  const out: RawActivity[] = [];
  for (let page = 1; page <= 10; page++) {
    const items = await api<RawActivity[]>(`/athlete/activities?after=${after}&per_page=200&page=${page}`);
    out.push(...items);
    if (items.length < 200) break;
  }
  return out
    .filter((a) => a.type === 'Run' || a.sport_type === 'Run' || a.sport_type === 'TrailRun')
    .map(fromRaw)
    .sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));
}

export interface Lap {
  index: number;
  distanceKm: number;
  movingTimeSec: number;
  paceSecPerKm: number | null;
  averageHeartRate: number | null;
  averageCadenceSpm: number | null;
}

export interface ActivityDetail extends StravaActivity {
  laps: Lap[];
}

interface RawLap {
  lap_index: number;
  distance: number;
  moving_time: number;
  average_speed: number;
  average_heartrate?: number;
  average_cadence?: number;
}

/** Full detail (incl. laps) for one activity — fetched on demand when the user opens it, not up front. */
export async function getActivityDetail(id: number): Promise<ActivityDetail> {
  const [activity, laps] = await Promise.all([
    api<RawActivity>(`/activities/${id}`),
    api<RawLap[]>(`/activities/${id}/laps`).catch(() => [] as RawLap[]),
  ]);
  return {
    ...fromRaw(activity),
    laps: laps.map((l) => ({
      index: l.lap_index,
      distanceKm: l.distance / 1000,
      movingTimeSec: l.moving_time,
      paceSecPerKm: l.average_speed > 0 ? 1000 / l.average_speed : null,
      averageHeartRate: l.average_heartrate ?? null,
      averageCadenceSpm: l.average_cadence != null ? l.average_cadence * 2 : null,
    })),
  };
}
