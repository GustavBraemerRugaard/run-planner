import { useEffect, useState } from 'react';
import { formatDuration, formatKm, formatPace } from '../domain/run';
import { getActivityDetail, type ActivityDetail as ActivityDetailData, type Lap, type StravaActivity } from '../lib/strava';
import { getStandardModalHeight } from '../lib/modalSize';

interface Props {
  activity: StravaActivity;
  onClose: () => void;
}

const CHART_W = 100;
const CHART_H = 56;
const MIN_BAR_H = 3;
const BAR_GAP = 0.6;

/** A "nice" round-km step for x-axis ticks, scaled to how far the run covered. */
function niceKmStep(totalKm: number): number {
  if (totalKm <= 3) return 0.5;
  if (totalKm <= 6) return 1;
  if (totalKm <= 12) return 2;
  if (totalKm <= 25) return 5;
  return 10;
}

/** Rounds `v` DOWN to the nearest multiple of `step` — used for the axis minimum, which must never
 * land above the padded observed minimum (rounding to the "nearest" multiple instead could round up
 * and eat into the required padding, or even land above the observed minimum itself). */
function floorToStep(v: number, step: number): number {
  return Math.floor(v / step) * step;
}

/** Rounds `v` UP to the nearest multiple of `step` — the maximum's counterpart to `floorToStep`. */
function ceilToStep(v: number, step: number): number {
  return Math.ceil(v / step) * step;
}

/**
 * Y-axis tick values between `axisMin` and `axisMax` (inclusive), evenly spaced by a multiple of
 * `step` chosen so there are at most `maxLabels` of them. `axisMin`/`axisMax` are always exact
 * multiples of `step` (see `floorToStep`/`ceilToStep`), so the span between them is always an exact
 * multiple of `step` too — this picks the smallest whole-step multiplier that divides the span
 * evenly and keeps the tick count within `maxLabels`, so every gap between labels is the same size
 * all the way to `axisMax`, never a shorter "leftover" last gap.
 */
function axisTicks(axisMin: number, axisMax: number, step: number, maxLabels = 5): number[] {
  const span = axisMax - axisMin;
  if (span <= 0) return [axisMin];
  const stepsAcross = Math.round(span / step);
  let multiplier = stepsAcross;
  for (let m = 1; m <= stepsAcross; m++) {
    if (stepsAcross % m === 0 && stepsAcross / m <= maxLabels - 1) {
      multiplier = m;
      break;
    }
  }
  const tickStep = step * multiplier;
  const ticks: number[] = [];
  for (let v = axisMin; v <= axisMax + tickStep * 1e-6; v += tickStep) ticks.push(Math.round(v / step) * step);
  return ticks;
}

/**
 * A lap-by-lap bar chart. Each bar's width is proportional to that lap's distance (so a 0.33 km
 * lap is visibly narrower than a 1 km lap), with a thin divider between bars so adjacent laps read
 * as distinct segments, and an x-axis in km showing distance covered. `invert` makes the smaller
 * value the taller bar (used for pace, where a lower number is the faster, "better" lap).
 *
 * The y-axis is deliberately wider than the raw min/max of the laps: `axisMin`/`axisMax` are pushed
 * outward by at least `axisPadding` past the observed min/max, then floored/ceiled out further to the
 * nearest multiple of `axisStep` — so the axis bounds are always both (a) strictly outside the
 * observed range by at least `axisPadding`, and (b) a "nice" rounded value (a half-minute for pace,
 * a multiple of 10 for heart rate), and the tallest/shortest bar never touches the top or bottom of
 * the plot.
 */
function LapChart({
  laps,
  accessor,
  color,
  invert = false,
  unitFmt,
  axisStep,
  axisPadding,
}: {
  laps: Lap[];
  accessor: (l: Lap) => number | null;
  color: string;
  invert?: boolean;
  unitFmt: (v: number) => string;
  /** The axis bounds are always a multiple of this (seconds for pace, bpm for HR) — a half-minute
   * (30s) for pace, 10 bpm for heart rate. */
  axisStep: number;
  /** The minimum required gap between the axis bound and the actual observed min/max — 30s for
   * pace, 10 bpm for heart rate (see the call sites below). The axis is pushed out to the nearest
   * multiple of `axisStep` beyond this, so the real gap can end up larger than this minimum, but
   * never smaller. */
  axisPadding: number;
}) {
  const values = laps.map(accessor);
  const present = values.filter((v): v is number => v != null);
  if (present.length < 2) return null;
  const min = Math.min(...present);
  const max = Math.max(...present);
  const axisMin = floorToStep(min - axisPadding, axisStep);
  const axisMax = ceilToStep(max + axisPadding, axisStep);
  const range = axisMax - axisMin || 1;

  const bounds: number[] = [0];
  for (const l of laps) bounds.push(bounds[bounds.length - 1] + Math.max(l.distanceKm, 0));
  const total = bounds[bounds.length - 1] || 1;

  const bars = laps
    .map((l, i) => {
      const v = values[i];
      if (v == null) return null;
      const x0 = (bounds[i] / total) * CHART_W;
      const x1 = (bounds[i + 1] / total) * CHART_W;
      const norm = (v - axisMin) / range;
      const heightFrac = invert ? 1 - norm : norm;
      const height = Math.max(Math.min(heightFrac, 1) * CHART_H, MIN_BAR_H);
      return {
        key: i,
        x: x0 + BAR_GAP / 2,
        width: Math.max(x1 - x0 - BAR_GAP, 0.4),
        height,
        y: CHART_H - height,
        label: `Lap ${l.index}: ${unitFmt(v)}`,
      };
    })
    .filter((b): b is { key: number; x: number; width: number; height: number; y: number; label: string } => b !== null);

  // Intermediate y-axis labels between the bounds, positioned by the same normalized-height math as
  // the bars themselves so each label lines up with the row of bars it corresponds to.
  const yTicks = axisTicks(axisMin, axisMax, axisStep).map((v) => {
    const norm = (v - axisMin) / range;
    const heightFrac = invert ? 1 - norm : norm;
    return { value: v, topPct: (1 - heightFrac) * 100 };
  });

  const step = niceKmStep(total);
  const ticks: number[] = [];
  for (let d = 0; d <= total + 1e-6; d += step) ticks.push(Math.round(d * 100) / 100);
  if (ticks.length === 0 || total - ticks[ticks.length - 1] > step * 0.4) ticks.push(Math.round(total * 100) / 100);

  return (
    <div className="lap-chart-row">
      <div className="lap-chart-plot">
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" className="lap-chart">
          {bars.map((b) => (
            <rect key={b.key} x={b.x} y={b.y} width={b.width} height={b.height} fill={color}>
              <title>{b.label}</title>
            </rect>
          ))}
          {bounds.slice(1, -1).map((d, i) => (
            <line
              key={i}
              x1={(d / total) * CHART_W}
              x2={(d / total) * CHART_W}
              y1={0}
              y2={CHART_H}
              style={{ stroke: 'var(--border)' }}
              strokeWidth={0.4}
            />
          ))}
        </svg>
        <div className="lap-chart-xaxis">
          {ticks.map((t, i) => (
            <span
              key={t}
              style={{
                left: `${(t / total) * 100}%`,
                transform: i === 0 ? 'translateX(0)' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
              }}
            >
              {Number.isInteger(t) ? t : t.toFixed(1)} km
            </span>
          ))}
        </div>
      </div>
      <div className="lap-chart-axis">
        {yTicks.map((t) => (
          // Always centered on its own tick position (never edge-anchored), so labels that are the
          // same numeric distance apart end up the same pixel distance apart too.
          <span key={t.value} style={{ top: `${t.topPct}%`, transform: 'translateY(-50%)' }}>
            {unitFmt(t.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Distance, time, pace, HR, cadence, and a per-lap breakdown for one completed Strava run. */
export default function ActivityDetail({ activity, onClose }: Props) {
  const [detail, setDetail] = useState<ActivityDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getActivityDetail(activity.id)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activity.id]);

  const d = detail ?? activity;
  const when = new Date(`${activity.date}T${activity.time || '00:00'}`);

  // Matches the edit/create-run popup's own (content-driven) height — the app's shared popup-size
  // standard — rather than sizing to this activity's own content, which can be much taller (lap
  // charts, a long laps table) or shorter. Only applied at the desktop side-by-side breakpoint; below
  // it, popups are full-width sheets and size to their own content as usual.
  const [standardHeight, setStandardHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const update = () => setStandardHeight(mq.matches ? getStandardModalHeight() : undefined);
    mq.addEventListener('change', update);
    update();
    return () => mq.removeEventListener('change', update);
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-wrap single" onClick={(e) => e.stopPropagation()}>
        <div className="modal" style={standardHeight ? { height: standardHeight } : undefined}>
          <h2>{activity.name}</h2>
          <p className="fine">
            {when.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
            {when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </p>

          <div className="totals activity-totals">
            <div>
              <span className="label">Distance</span>
              <strong>{formatKm(d.distanceKm)} km</strong>
            </div>
            <div>
              <span className="label">Time</span>
              <strong>{formatDuration(d.movingTimeSec)}</strong>
            </div>
            <div>
              <span className="label">Pace</span>
              <strong>{d.paceSecPerKm ? `${formatPace(d.paceSecPerKm)}/km` : '—'}</strong>
            </div>
            {d.averageHeartRate != null && (
              <div>
                <span className="label">Avg HR</span>
                <strong>{Math.round(d.averageHeartRate)} bpm</strong>
              </div>
            )}
            {d.averageCadenceSpm != null && (
              <div>
                <span className="label">Cadence</span>
                <strong>{Math.round(d.averageCadenceSpm)} spm</strong>
              </div>
            )}
          </div>

          {loading && <p className="fine">Loading laps…</p>}
          {error && (
            <p className="fine error" role="alert">
              {error}
            </p>
          )}

          {detail && detail.laps.length > 1 && (
            <div className="lap-charts">
              <div className="lap-chart-block">
                <span className="label">Pace</span>
                <LapChart
                  laps={detail.laps}
                  accessor={(l) => l.paceSecPerKm}
                  color="#0284c7"
                  invert
                  unitFmt={(v) => formatPace(v)}
                  axisStep={30}
                  axisPadding={30}
                />
              </div>
              {detail.laps.some((l) => l.averageHeartRate != null) && (
                <div className="lap-chart-block">
                  <span className="label">Heart Rate</span>
                  <LapChart
                    laps={detail.laps}
                    accessor={(l) => l.averageHeartRate}
                    color="#ef4444"
                    unitFmt={(v) => `${Math.round(v)} bpm`}
                    axisStep={10}
                    axisPadding={10}
                  />
                </div>
              )}
            </div>
          )}

          {detail && detail.laps.length > 0 && (
            <div className="laps">
              <span className="label">Laps</span>
              <table className="laps-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Dist</th>
                    <th>Time</th>
                    <th>Pace</th>
                    <th>HR</th>
                    <th>Cad</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.laps.map((l) => (
                    <tr key={l.index}>
                      <td>{l.index}</td>
                      <td>{formatKm(l.distanceKm)} km</td>
                      <td>{formatDuration(l.movingTimeSec)}</td>
                      <td>{l.paceSecPerKm ? formatPace(l.paceSecPerKm) : '—'}</td>
                      <td>{l.averageHeartRate != null ? Math.round(l.averageHeartRate) : '—'}</td>
                      <td>{l.averageCadenceSpm != null ? Math.round(l.averageCadenceSpm) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="actions">
            <span className="spacer" />
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
