import type { CalendarEvent, CalendarEventInput } from '../lib/calendar';
import type { StravaActivity } from '../lib/strava';

/**
 * The "domain" layer: what a planned run IS in this app, independent of Google Calendar or the UI.
 *
 * A run is always an all-day calendar entry, made of one or more "steps" (warm-up, main set(s),
 * cool-down). Total distance and average pace are always DERIVED from the steps — never entered
 * directly — so the calendar title and the stats stay consistent with the workout plan.
 */

export type RunType = 'easy' | 'tempo' | 'long' | 'intervals' | 'race';

export interface RunTypeInfo {
  label: string;
  /** Subtle, pastel background — meant to sit behind text (chips, calendar pills). */
  color: string;
  /** Text color readable on top of `color`. */
  textColor: string;
  /** Words (English + Danish) used to guess the type from an old free-text title. */
  keywords: string[];
}

export const RUN_TYPES: Record<RunType, RunTypeInfo> = {
  easy: { label: 'Easy', color: '#bbf7d0', textColor: '#14532d', keywords: ['easy', 'rolig', 'jog'] },
  tempo: { label: 'Tempo', color: '#fecaca', textColor: '#7f1d1d', keywords: ['tempo', 'threshold', 'tærskel', 'lt'] },
  long: { label: 'Long Run', color: '#fef08a', textColor: '#713f12', keywords: ['long', 'lang', 'langtur'] },
  intervals: { label: 'Intervals', color: '#fca5a5', textColor: '#7f1d1d', keywords: ['interval', 'fartleg', 'bakke', 'hill'] },
  race: { label: 'Race', color: '#e9d5ff', textColor: '#581c87', keywords: ['race', 'konkurrence', 'marathon', 'halvmarathon'] },
};

export const RUN_TYPE_ORDER: RunType[] = ['easy', 'tempo', 'long', 'intervals', 'race'];

/** Completed (Strava) runs are always shown in this color, distinct from every planned type. */
export const ACTUAL_COLOR = '#f97316';
export const ACTUAL_TEXT_COLOR = '#ffffff';

export type RestType = 'distance' | 'time';

export interface Rest {
  /** Which raw value you enter: a distance to cover, or a time to spend, between reps. */
  type: RestType;
  /** Meters for 'distance', seconds for 'time'. */
  value: number;
  /**
   * Recovery pace in seconds per km, or null for a standing rest (no distance covered). Lets a
   * 'distance' rest imply a time, or a 'time' rest imply a distance — either way it counts toward
   * total distance and the run's average pace, same as any other step.
   */
  paceSecPerKm: number | null;
}

export type StepKind = 'warmup' | 'main' | 'cooldown';

export interface Step {
  id: string;
  kind: StepKind;
  /** Number of repetitions of this segment (warm-up/cool-down are always 1 rep). */
  reps: number;
  /** Distance of ONE rep, in km. */
  distanceKm: number;
  /** Target pace in seconds per km, or null if no target pace was set for this step. */
  paceSecPerKm: number | null;
  /** Rest taken between reps (ignored when reps <= 1, and for warm-up/cool-down). */
  rest: Rest | null;
}

export interface Run {
  /** Google event id; undefined for a run that has not been saved yet. */
  id?: string;
  type: RunType;
  /** YYYY-MM-DD, local date. All runs are all-day entries. */
  date: string;
  steps: Step[];
  /** Instructions text shown as the calendar event's description. */
  description: string;
  /**
   * The auto-generated description this run last had. If `description` still equals this value,
   * the next step edit is free to regenerate it; once the user diverges from it, their text is kept.
   */
  autoDescription: string;
}

let idCounter = 0;
export function newStepId(): string {
  idCounter += 1;
  return `s${Date.now().toString(36)}${idCounter}`;
}

export function newStep(kind: StepKind, overrides: Partial<Step> = {}): Step {
  return {
    id: newStepId(),
    kind,
    reps: 1,
    distanceKm: kind === 'warmup' || kind === 'cooldown' ? 1.25 : 1,
    paceSecPerKm: null,
    rest: null,
    ...overrides,
  };
}

// ---- Derived numbers -------------------------------------------------------------------------

/**
 * Distance covered by rest between reps, in km. A 'distance' rest always covers its entered
 * distance; a 'time' rest only covers distance if it has a pace (otherwise it's a standing rest).
 */
export function restDistanceKm(step: Step): number {
  if (!step.rest || step.reps <= 1) return 0;
  const restCount = step.reps - 1;
  const r = step.rest;
  if (r.type === 'distance') return (r.value / 1000) * restCount;
  return r.paceSecPerKm ? (r.value / r.paceSecPerKm) * restCount : 0;
}

/**
 * Time spent on rest between reps, in seconds. A 'time' rest always takes its entered time; a
 * 'distance' rest only has a known time if it has a pace (otherwise its time isn't tracked).
 */
export function restTimeSec(step: Step): number {
  if (!step.rest || step.reps <= 1) return 0;
  const restCount = step.reps - 1;
  const r = step.rest;
  if (r.type === 'time') return r.value * restCount;
  return r.paceSecPerKm ? (r.value / 1000) * r.paceSecPerKm * restCount : 0;
}

export function stepDistanceKm(step: Step): number {
  return step.reps * step.distanceKm + restDistanceKm(step);
}

export function totalDistanceKm(steps: Step[]): number {
  return steps.reduce((sum, s) => sum + stepDistanceKm(s), 0);
}

/** Distance-weighted average pace across steps and rests that have a target pace, in seconds per km. */
export function averagePaceSecPerKm(steps: Step[]): number | null {
  let distance = 0;
  let time = 0;
  for (const s of steps) {
    if (s.paceSecPerKm != null) {
      const d = s.reps * s.distanceKm;
      distance += d;
      time += d * s.paceSecPerKm;
    }
    const restKm = restDistanceKm(s);
    const restSec = restTimeSec(s);
    if (restKm > 0 && restSec > 0) {
      distance += restKm;
      time += restSec;
    }
  }
  return distance > 0 ? time / distance : null;
}

// ---- Formatting -------------------------------------------------------------------------------

/** "11,25" / "15" — up to 2 decimals, trailing zeros trimmed, comma as the decimal separator. */
export function formatKm(km: number): string {
  const rounded = Math.round(km * 100) / 100;
  const s = rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return (s === '' ? '0' : s).replace('.', ',');
}

/** "4:15" from seconds per km. */
export function formatPace(secPerKm: number): string {
  const total = Math.round(secPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "4:15" (mm:ss) or "4:15,3" (mm:ss,d) -> seconds per km. Returns null if unparseable. */
export function parsePace(text: string): number | null {
  const m = text.trim().match(/^(\d+):([0-5]?\d)(?:[.,](\d))?$/);
  if (!m) return null;
  const min = parseInt(m[1], 10);
  const sec = parseInt(m[2], 10);
  const tenth = m[3] ? parseInt(m[3], 10) : 0;
  return min * 60 + sec + tenth / 10;
}

export function formatRest(rest: Rest): string {
  const pace = rest.paceSecPerKm != null ? ` @ ${formatPace(rest.paceSecPerKm)}` : '';
  if (rest.type === 'distance') {
    const dist = rest.value >= 1000 ? `${formatKm(rest.value / 1000)}k` : `${rest.value}m`;
    return `${dist} rest${pace}`;
  }
  const m = Math.floor(rest.value / 60);
  const s = rest.value % 60;
  const time = m > 0 ? `${m}${s ? `:${String(s).padStart(2, '0')}` : 'min'}` : `${s}s`;
  return `${time} rest${pace}`;
}

export function buildTitle(type: RunType, steps: Step[]): string {
  return `${formatKm(totalDistanceKm(steps))}k ${RUN_TYPES[type].label}`;
}

function stepLine(step: Step): string {
  const pace = step.paceSecPerKm != null ? ` @ ${formatPace(step.paceSecPerKm)} min/km` : '';
  const rest = step.rest && step.reps > 1 ? ` (${formatRest(step.rest)})` : '';
  const label = step.kind === 'warmup' ? 'WU' : step.kind === 'cooldown' ? 'CD' : null;
  if (label) return `${formatKm(step.distanceKm)}k ${label}${pace}`;
  const prefix = step.reps > 1 ? `${step.reps}x${formatKm(step.distanceKm)}k` : `${formatKm(step.distanceKm)}k`;
  return `${prefix}${pace}${rest}`;
}

/** The human-readable instructions text generated from the current steps, e.g. Gustav's convention:
 *  "1,25k WU\n5x1k @ 4:15 min/km (200m rest)\n2,5k CD" */
export function buildDescription(steps: Step[]): string {
  return steps.map(stepLine).join('\n');
}

// ---- Google Calendar <-> Run ------------------------------------------------------------------

const PROP_TYPE = 'runType';
const PROP_STEPS = 'steps';
const PROP_AUTO_DESC = 'autoDesc';

function serializeSteps(steps: Step[]): string {
  // Compact tuple encoding to stay well under Google's extendedProperties size limits:
  // [kind, reps, distanceKm, paceSecPerKm|null, restType|null, restValue|null, restPaceSecPerKm|null]
  const rows = steps.map((s) => [
    s.kind,
    s.reps,
    s.distanceKm,
    s.paceSecPerKm,
    s.rest?.type ?? null,
    s.rest?.value ?? null,
    s.rest?.paceSecPerKm ?? null,
  ]);
  return JSON.stringify(rows);
}

function deserializeSteps(json: string | undefined): Step[] {
  if (!json) return [];
  try {
    const rows = JSON.parse(json) as [
      StepKind,
      number,
      number,
      number | null,
      RestType | null,
      number | null,
      number | null,
    ][];
    return rows.map(([kind, reps, distanceKm, paceSecPerKm, restType, restValue, restPaceSecPerKm]) =>
      newStep(kind, {
        reps,
        distanceKm,
        paceSecPerKm,
        rest: restType && restValue != null ? { type: restType, value: restValue, paceSecPerKm: restPaceSecPerKm ?? null } : null,
      }),
    );
  } catch {
    return [];
  }
}

function guessTypeFromTitle(title: string): RunType {
  const t = title.toLowerCase();
  for (const type of RUN_TYPE_ORDER) {
    if (RUN_TYPES[type].keywords.some((k) => new RegExp(`(^|[^\\p{L}])${escapeRe(k)}([^\\p{L}]|$)`, 'iu').test(t))) {
      return type;
    }
  }
  return 'easy';
}

function guessDistanceFromTitle(title: string): number {
  const m = title.match(/(\d+(?:[.,]\d+)?)\s*k(?![\p{L}])/iu);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Google event -> Run. Structured `steps` win; a run from before this format existed becomes one plain step. */
export function fromEvent(ev: CalendarEvent): Run {
  const title = ev.summary ?? '';
  const priv = ev.extendedProperties?.private ?? {};
  const storedType = priv[PROP_TYPE] as RunType | undefined;
  const type = storedType && storedType in RUN_TYPES ? storedType : guessTypeFromTitle(title);
  let steps = deserializeSteps(priv[PROP_STEPS]);
  if (steps.length === 0) {
    const distanceKm = guessDistanceFromTitle(title);
    if (distanceKm > 0) steps = [newStep('main', { distanceKm })];
  }
  const description = ev.description ?? '';
  return {
    id: ev.id,
    type,
    date: ev.start.date ?? (ev.start.dateTime ?? '').slice(0, 10),
    steps,
    description,
    autoDescription: priv[PROP_AUTO_DESC] ?? description,
  };
}

/** Run -> body for Google's insert/patch. Always an all-day entry, end exclusive (date + 1 day). */
export function toEventInput(run: Run): CalendarEventInput {
  const nextDay = parseLocalDate(run.date);
  nextDay.setDate(nextDay.getDate() + 1);
  return {
    summary: buildTitle(run.type, run.steps),
    description: run.description,
    start: { date: run.date },
    end: { date: localDateString(nextDay) },
    extendedProperties: {
      private: {
        [PROP_TYPE]: run.type,
        [PROP_STEPS]: serializeSteps(run.steps),
        [PROP_AUTO_DESC]: run.autoDescription,
      },
    },
  };
}

// ---- Dates / weekly summaries ------------------------------------------------------------------

/** Monday-based (per config) start of the week containing the given date, as YYYY-MM-DD in local time. */
export function weekKey(date: Date, firstDay: number): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (d.getDay() - firstDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return localDateString(d);
}

export function localDateString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export interface WeekSummary {
  weekStart: string;
  totalKm: number;
  runs: number;
  byType: Partial<Record<RunType, number>>;
}

export function summarizeWeeks(runs: Run[], firstDay: number): Map<string, WeekSummary> {
  const map = new Map<string, WeekSummary>();
  for (const r of runs) {
    const key = weekKey(parseLocalDate(r.date), firstDay);
    const km = totalDistanceKm(r.steps);
    const w = map.get(key) ?? { weekStart: key, totalKm: 0, runs: 0, byType: {} };
    w.runs += 1;
    w.totalKm += km;
    w.byType[r.type] = (w.byType[r.type] ?? 0) + km;
    map.set(key, w);
  }
  return map;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---- Planned + actual, combined -----------------------------------------------------------------

/** "1:23:04" (h:mm:ss) or "45:30" (m:ss). */
export function formatDuration(sec: number): string {
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export interface DayEntries {
  date: string;
  planned: Run[];
  actual: StravaActivity[];
}

/** Everything planned and everything actually run, grouped by local date. */
export function buildDayEntries(runs: Run[], activities: StravaActivity[]): Map<string, DayEntries> {
  const map = new Map<string, DayEntries>();
  const ensure = (date: string): DayEntries => {
    let e = map.get(date);
    if (!e) {
      e = { date, planned: [], actual: [] };
      map.set(date, e);
    }
    return e;
  };
  for (const r of runs) ensure(r.date).planned.push(r);
  for (const a of activities) ensure(a.date).actual.push(a);
  return map;
}

export interface CombinedWeekSummary extends WeekSummary {
  /** km that came from completed (Strava) runs, a subset of totalKm. */
  actualKm: number;
  /** true if part of this week's total is still a plan rather than something you've actually run. */
  isPlanned: boolean;
}

/**
 * Weekly totals for the "active week" card and the mileage chart: days before today use what Strava
 * actually recorded, today and future days use what's planned in the calendar (flagged via isPlanned
 * so the UI can say so) — unless today already has a recorded run, in which case that counts instead.
 */
export function summarizeCombinedWeeks(
  runs: Run[],
  activities: StravaActivity[],
  firstDay: number,
  today: Date = new Date(),
): Map<string, CombinedWeekSummary> {
  const todayStr = localDateString(today);
  const byDate = buildDayEntries(runs, activities);
  const map = new Map<string, CombinedWeekSummary>();
  for (const entry of byDate.values()) {
    const key = weekKey(parseLocalDate(entry.date), firstDay);
    const w = map.get(key) ?? { weekStart: key, totalKm: 0, runs: 0, byType: {}, actualKm: 0, isPlanned: false };
    if (entry.actual.length > 0) {
      for (const a of entry.actual) {
        w.totalKm += a.distanceKm;
        w.actualKm += a.distanceKm;
        w.runs += 1;
      }
    } else if (entry.date >= todayStr) {
      for (const r of entry.planned) {
        const km = totalDistanceKm(r.steps);
        w.totalKm += km;
        w.runs += 1;
        w.byType[r.type] = (w.byType[r.type] ?? 0) + km;
      }
      if (entry.planned.length > 0) w.isPlanned = true;
    }
    // a past day with no recorded run contributes nothing (a rest day / missed session).
    map.set(key, w);
  }
  return map;
}

export interface ActualWeekSummary {
  weekStart: string;
  runs: number;
  totalKm: number;
  totalTimeSec: number;
  avgPaceSecPerKm: number | null;
  avgHeartRate: number | null;
}

/** Pure "what actually happened" weekly stats from Strava, for the historic-weeks list. */
export function summarizeActualWeeks(activities: StravaActivity[], firstDay: number): Map<string, ActualWeekSummary> {
  const map = new Map<string, ActualWeekSummary>();
  const hrSum = new Map<string, { sum: number; time: number }>();
  for (const a of activities) {
    const key = weekKey(parseLocalDate(a.date), firstDay);
    const w = map.get(key) ?? { weekStart: key, runs: 0, totalKm: 0, totalTimeSec: 0, avgPaceSecPerKm: null, avgHeartRate: null };
    w.runs += 1;
    w.totalKm += a.distanceKm;
    w.totalTimeSec += a.movingTimeSec;
    map.set(key, w);
    if (a.averageHeartRate != null) {
      const acc = hrSum.get(key) ?? { sum: 0, time: 0 };
      acc.sum += a.averageHeartRate * a.movingTimeSec;
      acc.time += a.movingTimeSec;
      hrSum.set(key, acc);
    }
  }
  for (const [key, w] of map) {
    w.avgPaceSecPerKm = w.totalKm > 0 ? w.totalTimeSec / w.totalKm : null;
    const acc = hrSum.get(key);
    if (acc && acc.time > 0) w.avgHeartRate = acc.sum / acc.time;
  }
  return map;
}

export interface AverageStats {
  weeksCount: number;
  avgRunsPerWeek: number;
  avgKmPerWeek: number;
  avgTimeSecPerWeek: number;
  /** Total time / total distance across the whole window — not an average of per-week paces. */
  avgPaceSecPerKm: number | null;
}

/**
 * Average weekly stats from actual Strava data over the last `weeksCount` weeks, including the
 * current (possibly partial) week, so the averages line up with what `WeeklyHistoryList` shows.
 */
export function summarizeAverages(
  activities: StravaActivity[],
  firstDay: number,
  weeksCount: number,
  today: Date = new Date(),
): AverageStats {
  const currentWeekStart = weekKey(today, firstDay);
  const start = parseLocalDate(currentWeekStart);
  start.setDate(start.getDate() - 7 * (weeksCount - 1));
  const startStr = localDateString(start);
  let runs = 0;
  let totalKm = 0;
  let totalTimeSec = 0;
  for (const a of activities) {
    if (a.date >= startStr) {
      runs += 1;
      totalKm += a.distanceKm;
      totalTimeSec += a.movingTimeSec;
    }
  }
  return {
    weeksCount,
    avgRunsPerWeek: runs / weeksCount,
    avgKmPerWeek: totalKm / weeksCount,
    avgTimeSecPerWeek: totalTimeSec / weeksCount,
    avgPaceSecPerKm: totalKm > 0 ? totalTimeSec / totalKm : null,
  };
}

export type Trend = 'up' | 'down' | 'flat';

/** Simple week-on-week direction, ignoring noise below `epsilonFrac` of the previous value. */
export function trend(curr: number | null, prev: number | null, epsilonFrac = 0.02): Trend {
  if (curr == null || prev == null || prev === 0) return 'flat';
  const delta = (curr - prev) / prev;
  if (delta > epsilonFrac) return 'up';
  if (delta < -epsilonFrac) return 'down';
  return 'flat';
}

// ---- Run-form weekly context --------------------------------------------------------------------

export interface WeekEntry {
  date: string;
  label: string;
  km: number;
  kind: 'actual' | 'planned';
  /** Only set for planned entries. */
  runType?: RunType;
  /** True for the run currently being edited in the form (which may not be saved yet). */
  isDraft?: boolean;
}

export interface RunFormWeekContext {
  prevWeekStart: string;
  weekStart: string;
  /** The 7 dates of the previous week, in order. */
  prevWeekDates: string[];
  /** The 7 dates of the week containing the run being edited, in order. */
  currentWeekDates: string[];
  prevWeekEntries: WeekEntry[];
  currentWeekEntries: WeekEntry[];
  /** This week's total km (actual wins over planned on any day both exist), including the draft run. */
  currentWeekTotalKm: number;
  /** Total km over the trailing 7 days ending on (and including) the draft run's date. */
  rolling7DayKm: number;
  /** km per run type this week, from planned runs on days with no actual (same rule as above). */
  currentWeekByType: Partial<Record<RunType, number>>;
}

export function addDaysLocal(dateStr: string, n: number): string {
  const d = parseLocalDate(dateStr);
  d.setDate(d.getDate() + n);
  return localDateString(d);
}

/**
 * Weekly context for the run-editing form: what's already planned or done in the surrounding weeks,
 * so a new or edited run can be seen against the intensity around it. `draft` is the run as currently
 * being edited in the form (its live date/type/steps, which may differ from what's saved) — its saved
 * counterpart, if any, is excluded via `excludeRunId` so it isn't counted twice.
 */
export function buildRunFormWeekContext(
  dayEntries: Map<string, DayEntries>,
  firstDay: number,
  draft: { date: string; type: RunType; steps: Step[] },
  excludeRunId: string | undefined,
): RunFormWeekContext {
  const weekStart = weekKey(parseLocalDate(draft.date), firstDay);
  const prevWeekStart = addDaysLocal(weekStart, -7);
  const draftKm = totalDistanceKm(draft.steps);

  function dayList(date: string): WeekEntry[] {
    const entry = dayEntries.get(date);
    const list: WeekEntry[] = [];
    const actual = entry?.actual ?? [];
    for (const a of actual) {
      list.push({ date, label: a.name, km: a.distanceKm, kind: 'actual' });
    }
    // When Strava already has an actual run for this day, the calendar (planned) entry for the same
    // day is redundant in this list — only the Strava one shows. The run currently being edited is
    // still always shown here (marked "(editing)"), regardless of what else happened that day.
    if (actual.length === 0) {
      for (const r of entry?.planned ?? []) {
        if (r.id === excludeRunId) continue;
        list.push({ date, label: buildTitle(r.type, r.steps), km: totalDistanceKm(r.steps), kind: 'planned', runType: r.type });
      }
    }
    if (date === draft.date) {
      list.push({ date, label: buildTitle(draft.type, draft.steps), km: draftKm, kind: 'planned', runType: draft.type, isDraft: true });
    }
    return list;
  }

  /** This day's contribution to a total: actual entries win over planned when both exist. */
  function dayKm(date: string): number {
    const list = dayList(date);
    const actualEntries = list.filter((e) => e.kind === 'actual');
    const source = actualEntries.length > 0 ? actualEntries : list;
    return source.reduce((sum, e) => sum + e.km, 0);
  }

  /** This week's run-type mix is calendar-only: it always reflects planned runs, even on a day that
   * also has a Strava activity (unlike the day lists and totals above, which prefer Strava there). */
  function addByTypeContribution(date: string, acc: Partial<Record<RunType, number>>) {
    const entry = dayEntries.get(date);
    for (const r of entry?.planned ?? []) {
      if (r.id === excludeRunId) continue;
      acc[r.type] = (acc[r.type] ?? 0) + totalDistanceKm(r.steps);
    }
    if (date === draft.date) {
      acc[draft.type] = (acc[draft.type] ?? 0) + draftKm;
    }
  }

  const prevWeekDates = Array.from({ length: 7 }, (_, i) => addDaysLocal(prevWeekStart, i));
  const currentWeekDates = Array.from({ length: 7 }, (_, i) => addDaysLocal(weekStart, i));

  const prevWeekEntries = prevWeekDates.flatMap(dayList);
  const currentWeekEntries = currentWeekDates.flatMap(dayList);
  const currentWeekTotalKm = currentWeekDates.reduce((sum, d) => sum + dayKm(d), 0);

  const currentWeekByType: Partial<Record<RunType, number>> = {};
  for (const d of currentWeekDates) addByTypeContribution(d, currentWeekByType);

  const rolling7DayKm = Array.from({ length: 7 }, (_, i) => addDaysLocal(draft.date, i - 6)).reduce(
    (sum, d) => sum + dayKm(d),
    0,
  );

  return {
    prevWeekStart,
    weekStart,
    prevWeekDates,
    currentWeekDates,
    prevWeekEntries,
    currentWeekEntries,
    currentWeekTotalKm,
    rolling7DayKm,
    currentWeekByType,
  };
}
