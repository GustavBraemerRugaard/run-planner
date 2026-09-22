import { useEffect, useState } from 'react';
import { formatDuration, formatKm, formatPace } from '../domain/run';
import { getActivityDetail, type ActivityDetail as ActivityDetailData, type Lap, type StravaActivity } from '../lib/strava';

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

/** Rounds `v` to the nearest multiple of `step`. */
function roundToNearest(v: number, step: number): number {
  return Math.round(v / step) * step;
}

/**
 * Y-axis tick values between `axisMin` and `axisMax` (inclusive), spaced by a multiple of `step`
 * chosen so there are at most `maxLabels` of them — few enough to stay readable, but scaled to how
 * wide the axis span actually is (a narrow span gets fewer, closer-together labels).
 */
function axisTicks(axisMin: number, axisMax: number, step: number, maxLabels = 5): number[] {
  const span = axisMax - axisMin;
  if (span <= 0) return [axisMin];
  const stepsAcross = span / step;
  const multiplier = Math.max(1, Math.ceil(stepsAcross / (maxLabels - 1)));
  const tickStep = step * multiplier;
  const ticks: number[] = [];
  for (let v = axisMin; v < axisMax - tickStep * 1e-6; v += tickStep) ticks.push(Math.round(v / step) * step);
  ticks.push(axisMax);
  return ticks;
}

/**
 * A lap-by-lap bar chart. Each bar's width is proportional to that lap's distance (so a 0.33 km
 * lap is visibly narrower than a 1 km lap), with a thin divider between bars so adjacent laps read
 * as distinct segments, and an x-axis in km showing distance covered. `invert` makes the smaller
 * value the taller bar (used for pace, where a lower number is the faster, "better" lap).
 *
 * The y-axis is deliberately wider than the raw min/max of the laps: it pads outward by
 * `axisPadding` before rounding to the nearest `axisStep`, so the tallest/shortest bar never
 * touches the top or bottom of the plot.
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
  /** Round the padded axis bounds to the nearest multiple of this (seconds for pace, bpm for HR). */
  axisStep: number;
  /** How far past the actual min/max the axis bounds are pushed before rounding. */
  axisPadding: number;
}) {
  const values = laps.map(accessor);
  const present = values.filter((v): v is number => v != null);
  if (present.length < 2) return null;
  const min = Math.min(...present);
  const max = Math.max(...present);
  const axisMin = roundToNearest(min - axisPadding, axisStep);
  const axisMax = roundToNearest(max + axisPadding, axisStep);
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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
                axisPadding={16}
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
                  axisPadding={16}
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
  );
}
