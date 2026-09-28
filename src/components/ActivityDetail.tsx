import { useEffect, useState } from 'react';
import { formatDuration, formatKm, formatPace } from '../domain/run';
import {
  getActivityDetail,
  getActivityStreams,
  type ActivityDetail as ActivityDetailData,
  type Lap,
  type StravaActivity,
  type StreamPoint,
} from '../lib/strava';
import { getStandardModalHeight } from '../lib/modalSize';
import { ceilToStep, evenTicks, floorToStep, niceKmStep } from '../lib/chartMath';
import StreamChart from './StreamChart';

interface Props {
  activity: StravaActivity;
  onClose: () => void;
}

const CHART_W = 100;
const CHART_H = 56;
const MIN_BAR_H = 3;
const BAR_GAP = 0.6;

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
 * the plot. Kept as the secondary ("Laps") view alongside the default `StreamChart` — see the
 * Streams/Laps toggle below — for whoever wants the older per-lap-average read.
 *
 * Each bar's hover readout is the one `.hovertip` in the app that can't be pure CSS (see the shared
 * "Hover tooltip" pattern note in styles.css for why: these bars are `<rect>`s inside a scaled SVG
 * `viewBox`, where embedding the real bordered-card markup at a fixed, un-stretched size isn't
 * practical) — `hoverIdx` tracks which bar (if any) has the mouse over it, and the `.hovertip` itself
 * renders as a plain HTML sibling of the `<svg>`, positioned by that bar's own x-center percentage,
 * mirroring the hover-crosshair approach `StreamChart` already uses for the same underlying reason.
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
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

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
        lapIndex: l.index,
        valueLabel: unitFmt(v),
      };
    })
    .filter(
      (b): b is { key: number; x: number; width: number; height: number; y: number; lapIndex: number; valueLabel: string } =>
        b !== null,
    );
  const hoverBar = hoverIdx != null ? bars.find((b) => b.key === hoverIdx) : undefined;

  // Intermediate y-axis labels between the bounds, positioned by the same normalized-height math as
  // the bars themselves so each label lines up with the row of bars it corresponds to.
  const yTicks = evenTicks(axisMin, axisMax).map((v) => {
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
            <rect
              key={b.key}
              x={b.x}
              y={b.y}
              width={b.width}
              height={b.height}
              fill={color}
              onMouseEnter={() => setHoverIdx(b.key)}
              onMouseLeave={() => setHoverIdx((h) => (h === b.key ? null : h))}
            />
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
        {hoverBar && (
          <span className="hovertip js-shown" style={{ left: `${((hoverBar.x + hoverBar.width / 2) / CHART_W) * 100}%` }}>
            <span className="hovertip-row">
              <span className="hovertip-key">Lap {hoverBar.lapIndex}</span>
              <span className="hovertip-value">{hoverBar.valueLabel}</span>
            </span>
          </span>
        )}
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
  const [streams, setStreams] = useState<StreamPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Default to the continuous ~10s-sample view (validated against the per-lap view in a live
  // comparison demo before this was built); falls back to 'laps' automatically below when a run has
  // no usable stream data (an old/third-party-imported activity), regardless of this default.
  const [chartMode, setChartMode] = useState<'streams' | 'laps'>('streams');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Fetched together (not gated on each other) so a slow or failing streams call never blocks the
    // laps table/chart from showing — getActivityStreams already swallows its own request errors and
    // resolves to [], so this Promise.all only rejects on a real getActivityDetail failure.
    Promise.all([getActivityDetail(activity.id), getActivityStreams(activity.id)])
      .then(([d, s]) => {
        if (!cancelled) {
          setDetail(d);
          setStreams(s);
        }
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

  const hasStreams = streams.length > 1;
  const hasLaps = !!detail && detail.laps.length > 1;
  // A run with only one of the two available just shows that one, with no toggle to switch to an
  // empty view; 'streams' stays the default whenever both are present.
  const effectiveMode = hasStreams ? chartMode : 'laps';

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

          {(hasStreams || hasLaps) && (
            <div className="chart-mode-head">
              <span className="label">Pace &amp; Heart Rate</span>
              {hasStreams && hasLaps && (
                <div className="seg-toggle chart-mode-toggle">
                  <button
                    type="button"
                    className={effectiveMode === 'streams' ? 'active' : ''}
                    onClick={() => setChartMode('streams')}
                  >
                    Streams
                  </button>
                  <button type="button" className={effectiveMode === 'laps' ? 'active' : ''} onClick={() => setChartMode('laps')}>
                    Laps
                  </button>
                </div>
              )}
            </div>
          )}

          {effectiveMode === 'streams' && hasStreams && (
            <div className="stream-charts">
              <div className="stream-chart-block">
                <span className="label">Pace</span>
                <StreamChart
                  points={streams}
                  accessor={(p) => p.paceSecPerKm}
                  color="#0284c7"
                  invert
                  unitFmt={(v) => `${formatPace(v)}/km`}
                  axisStep={30}
                  axisPadding={20}
                />
              </div>
              {streams.some((p) => p.heartRate != null) && (
                <div className="stream-chart-block">
                  <span className="label">Heart Rate</span>
                  <StreamChart
                    points={streams}
                    accessor={(p) => p.heartRate}
                    color="#ef4444"
                    unitFmt={(v) => `${Math.round(v)} bpm`}
                    axisStep={10}
                    axisPadding={8}
                  />
                </div>
              )}
            </div>
          )}

          {effectiveMode === 'laps' && detail && hasLaps && (
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
