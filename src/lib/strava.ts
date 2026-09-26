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
  /** Only present on the single-activity detail endpoint, not the activities list. */
  best_efforts?: RawBestEffort[];
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

/**
 * All runs (Run/TrailRun) newest first. `monthsBack` bounds how far back to fetch — omit it (or pass
 * `undefined`) for the athlete's full history, paginating until Strava returns an empty page.
 */
export async function listActivities(monthsBack: number | undefined = 6): Promise<StravaActivity[]> {
  const after = monthsBack != null ? Math.floor(Date.now() / 1000) - monthsBack * 30 * 24 * 3600 : 0;
  const out: RawActivity[] = [];
  // 40 pages of 200 = 8000 activities — comfortably past a lifetime of Strava history, just a safety
  // ceiling against ever looping forever.
  for (let page = 1; page <= 40; page++) {
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

// ---- Personal bests (true race-distance PRs, from Strava's own best-effort data) --------------

interface RawBestEffort {
  name: string; // e.g. "1k", "5k", "10k", "Half-Marathon", "Marathon"
  distance: number; // meters
  moving_time: number; // seconds
}

/** The named race distances Strava computes best-efforts for that we surface as "personal bests" —
 * the same distances Strava's own PR page shows. */
export const PB_DISTANCES = ['1k', '5k', '10k', 'Half-Marathon', 'Marathon'] as const;
export type PbDistance = (typeof PB_DISTANCES)[number];
export const PB_DISTANCE_LABELS: Record<PbDistance, string> = {
  '1k': '1K',
  '5k': '5K',
  '10k': '10K',
  'Half-Marathon': 'Half Marathon',
  Marathon: 'Marathon',
};

export interface PersonalBest {
  distance: PbDistance;
  movingTimeSec: number;
  /** Local date (YYYY-MM-DD) of the activity that set this best. */
  date: string;
}

const LS_BEST_EFFORTS_CACHE = 'strava_best_efforts_cache_v1';

interface CachedEffortsEntry {
  date: string;
  efforts: Partial<Record<PbDistance, { movingTimeSec: number }>>;
}

function loadEffortsCache(): Record<string, CachedEffortsEntry> {
  try {
    const raw = localStorage.getItem(LS_BEST_EFFORTS_CACHE);
    return raw ? (JSON.parse(raw) as Record<string, CachedEffortsEntry>) : {};
  } catch {
    return {};
  }
}

function saveEffortsCache(cache: Record<string, CachedEffortsEntry>): void {
  try {
    localStorage.setItem(LS_BEST_EFFORTS_CACHE, JSON.stringify(cache));
  } catch {
    // Cache is a pure optimization (storage full/unavailable just means re-fetching next time) — safe to drop.
  }
}

/**
 * This activity's best-efforts at our target distances, from cache if we've ever looked before,
 * otherwise a lighter fetch than `getActivityDetail` (skips `/laps`, which this doesn't need). A
 * completed activity's best-efforts never change, so a cache hit is never invalidated.
 */
async function bestEffortsForActivity(id: number, date: string, cache: Record<string, CachedEffortsEntry>): Promise<CachedEffortsEntry> {
  const key = String(id);
  const cached = cache[key];
  if (cached) return cached;

  const activity = await api<RawActivity>(`/activities/${id}`);
  const efforts: CachedEffortsEntry['efforts'] = {};
  for (const e of activity.best_efforts ?? []) {
    if (!(PB_DISTANCES as readonly string[]).includes(e.name)) continue;
    const dist = e.name as PbDistance;
    const existing = efforts[dist];
    if (!existing || e.moving_time < existing.movingTimeSec) efforts[dist] = { movingTimeSec: e.moving_time };
  }
  const entry: CachedEffortsEntry = { date, efforts };
  cache[key] = entry;
  return entry;
}

/**
 * Personal bests across three periods (all-time / this year / this month), sourced from Strava's own
 * best-effort data — the "gold standard" match for what Strava's own PR page shows, rather than an
 * approximation from average pace. Walks the athlete's full run history (all available history, per
 * how this app is configured — not just the ~6 months loaded elsewhere), fetching each activity's
 * best-efforts once and caching it in localStorage forever after: a repeat visit only pays the cost of
 * activities that are new since last time. `onProgress` (done, total) lets the UI show a fetch is in
 * progress the first time this runs for a long history.
 */
export async function getPersonalBests(onProgress?: (done: number, total: number) => void): Promise<{
  allTime: Partial<Record<PbDistance, PersonalBest>>;
  thisYear: Partial<Record<PbDistance, PersonalBest>>;
  thisMonth: Partial<Record<PbDistance, PersonalBest>>;
}> {
  const activities = await listActivities(undefined);
  const cache = loadEffortsCache();

  const now = new Date();
  const yearStr = String(now.getFullYear());
  const monthStr = `${yearStr}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const allTime: Partial<Record<PbDistance, PersonalBest>> = {};
  const thisYear: Partial<Record<PbDistance, PersonalBest>> = {};
  const thisMonth: Partial<Record<PbDistance, PersonalBest>> = {};

  function consider(bucket: Partial<Record<PbDistance, PersonalBest>>, dist: PbDistance, movingTimeSec: number, date: string) {
    const existing = bucket[dist];
    if (!existing || movingTimeSec < existing.movingTimeSec) bucket[dist] = { distance: dist, movingTimeSec, date };
  }

  let done = 0;
  try {
    for (const a of activities) {
      const resolved = await bestEffortsForActivity(a.id, a.date, cache);
      for (const dist of PB_DISTANCES) {
        const e = resolved.efforts[dist];
        if (!e) continue;
        consider(allTime, dist, e.movingTimeSec, resolved.date);
        if (resolved.date.slice(0, 4) === yearStr) consider(thisYear, dist, e.movingTimeSec, resolved.date);
        if (resolved.date.slice(0, 7) === monthStr) consider(thisMonth, dist, e.movingTimeSec, resolved.date);
      }
      done += 1;
      onProgress?.(done, activities.length);
      // Persist progress periodically, not just at the end, so a long first-time fetch over a big
      // history doesn't lose everything already fetched if it's interrupted (closed tab, rate limit).
      if (done % 20 === 0) saveEffortsCache(cache);
    }
  } finally {
    saveEffortsCache(cache);
  }

  return { allTime, thisYear, thisMonth };
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
