import { CALENDAR_ID } from '../config';
import { getToken } from './auth';

/**
 * The ONLY module that talks to Google Calendar. If you ever store plans somewhere else,
 * this is the file to replace.
 */

export interface EventTime {
  date?: string;
  dateTime?: string;
}

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start: EventTime;
  end: EventTime;
  extendedProperties?: { private?: Record<string, string> };
}

export interface CalendarEventInput {
  summary?: string;
  description?: string;
  start?: EventTime;
  end?: EventTime;
  extendedProperties?: { private?: Record<string, string> };
}

export class AuthError extends Error {}

const BASE = 'https://www.googleapis.com/calendar/v3';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) throw new AuthError('Not signed in');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (res.status === 401) throw new AuthError('Session expired');
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error?.message ?? '';
    } catch {
      /* ignore */
    }
    throw new Error(`Google Calendar error ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const cal = () => `/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;

export async function listEvents(timeMin: Date, timeMax: Date): Promise<CalendarEvent[]> {
  const out: CalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });
    if (pageToken) q.set('pageToken', pageToken);
    const page = await call<{ items?: CalendarEvent[]; nextPageToken?: string }>(`${cal()}?${q}`);
    out.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

export function insertEvent(body: CalendarEventInput): Promise<CalendarEvent> {
  return call<CalendarEvent>(cal(), { method: 'POST', body: JSON.stringify(body) });
}

export function patchEvent(id: string, body: CalendarEventInput): Promise<CalendarEvent> {
  return call<CalendarEvent>(`${cal()}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteEvent(id: string): Promise<void> {
  return call<void>(`${cal()}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
