import type { CalendarEvent, CalendarEventInput } from '../lib/calendar';

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
  color: string;
  /** Words (English + Danish) used to guess the type from an old free-text title. */
  keywords: string[];
}

export const RUN_TYPES: Record<RunType, RunTypeInfo> = {
  easy: { label: 'Easy', color: '#22c55e', keywords: ['easy', 'rolig', 'jog'] },
  tempo: { label: 'Tempo', color: '#f59e0b', keywords: ['tempo', 'threshold', 'tærskel', 'lt'] },
  long: { label: 'Long Run', color: '#3b82f6', keywords: ['long', 'lang', 'langtur'] },
  intervals: { label: 'Intervals', color: '#ef4444', keywords: ['interval', 'fartleg', 'bakke', 'hill'] },
  race: { label: 'Race', color: '#a855f7', keywords: ['race', 'konkurrence', 'marathon', 'halvmarathon'] },
};

export const RUN_TYPE_ORDER: RunType[] = ['easy', 'tempo', 'long', 'intervals', 'race'];

export type RestType = 'distance' | 'time';

export interface Rest {
  type: RestType;
  /** Meters for 'distance', seconds for 'time'. */
  value: number;
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

/** Distance covered by rest between reps, in km (0 for time-based or missing rest). */
function restDistanceKm(step: Step): number {
  if (!step.rest || step.reps <= 1) return 0;
  const restCount = step.reps - 1;
  return step.rest.type === 'distance' ? (step.rest.value / 1000) * restCount : 0;
}

export function stepDistanceKm(step: Step): number {
  return step.reps * step.distanceKm + restDistanceKm(step);
}

export function totalDistanceKm(steps: Step[]): number {
  return steps.reduce((sum, s) => sum + stepDistanceKm(s), 0);
}

/** Distance-weighted average pace across steps that have a target pace, in seconds per km. */
export function averagePaceSecPerKm(steps: Step[]): number | null {
  let distance = 0;
  let time = 0;
  for (const s of steps) {
    if (s.paceSecPerKm == null) continue;
    const d = s.reps * s.distanceKm;
    distance += d;
    time += d * s.paceSecPerKm;
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
  if (rest.type === 'distance') {
    return rest.value >= 1000 ? `${formatKm(rest.value / 1000)}k rest` : `${rest.value}m rest`;
  }
  const m = Math.floor(rest.value / 60);
  const s = rest.value % 60;
  return m > 0 ? `${m}${s ? `:${String(s).padStart(2, '0')}` : 'min'} rest` : `${s}s rest`;
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
  // [kind, reps, distanceKm, paceSecPerKm|null, restType|null, restValue|null]
  const rows = steps.map((s) => [
    s.kind,
    s.reps,
    s.distanceKm,
    s.paceSecPerKm,
    s.rest?.type ?? null,
    s.rest?.value ?? null,
  ]);
  return JSON.stringify(rows);
}

function deserializeSteps(json: string | undefined): Step[] {
  if (!json) return [];
  try {
    const rows = JSON.parse(json) as [StepKind, number, number, number | null, RestType | null, number | null][];
    return rows.map(([kind, reps, distanceKm, paceSecPerKm, restType, restValue]) =>
      newStep(kind, {
        reps,
        distanceKm,
        paceSecPerKm,
        rest: restType && restValue != null ? { type: restType, value: restValue } : null,
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
