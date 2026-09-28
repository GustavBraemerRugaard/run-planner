import { useMemo, useState, type PointerEvent } from 'react';
import { ceilToStep, evenTicks, floorToStep, niceKmStep } from '../lib/chartMath';
import { trailingRollingAverage } from '../lib/streamMath';
import type { StreamPoint } from '../lib/strava';

const CHART_W = 100;
const CHART_H = 76;
/** 30s trailing window at the ~10s bucket spacing `getActivityStreams` produces — validated against
 * a live comparison demo (raw vs. several window sizes) before picking this as the default. */
const ROLL_SAMPLES = 3;

/**
 * The continuous pace/HR-over-distance line — the default detail view (see the Streams/Laps toggle in
 * ActivityDetail), plotting every ~10s-bucketed sample (see `getActivityStreams` in lib/strava.ts)
 * rather than one bar per lap, smoothed with a 30s trailing rolling average (`lib/streamMath.ts`) so
 * surge/stall/drift shapes stay visible without sample-to-sample jitter drowning them out. Shares its
 * axis-tick math with `LapChart` via `lib/chartMath.ts`, and its hover-to-read-an-exact-value
 * interaction (crosshair + tooltip tracking the nearest sample) is a direct port of the pattern
 * validated in the live comparison demo before this was built.
 */
export default function StreamChart({
  points,
  accessor,
  color,
  invert = false,
  unitFmt,
  axisStep,
  axisPadding,
}: {
  points: StreamPoint[];
  accessor: (p: StreamPoint) => number | null;
  color: string;
  /** Same meaning as LapChart's `invert` — a lower value (faster pace) draws taller/hotter. */
  invert?: boolean;
  unitFmt: (v: number) => string;
  axisStep: number;
  axisPadding: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const smoothed = useMemo(() => trailingRollingAverage(points.map(accessor), ROLL_SAMPLES), [points, accessor]);

  const present = smoothed.filter((v): v is number => v != null);
  if (present.length < 2) return null;

  const min = Math.min(...present);
  const max = Math.max(...present);
  const axisMin = floorToStep(min - axisPadding, axisStep);
  const axisMax = ceilToStep(max + axisPadding, axisStep);
  const range = axisMax - axisMin || 1;

  const totalKm = points[points.length - 1]?.distKm || 1;
  function xFor(distKm: number) {
    return (distKm / totalKm) * CHART_W;
  }
  function yFor(v: number) {
    const norm = (v - axisMin) / range;
    const frac = invert ? 1 - norm : norm;
    return CHART_H - Math.min(Math.max(frac, 0), 1) * CHART_H;
  }

  // Coordinates for every point (even where the smoothed value is null, e.g. a treadmill run's
  // missing HR) so hover-nearest-sample lookup by distance still works across the whole run; the
  // line/area path itself only connects points with a real value.
  const coords: { x: number; y: number; distKm: number; v: number | null }[] = [];
  let linePath = '';
  points.forEach((p, i) => {
    const v = smoothed[i];
    const x = xFor(p.distKm);
    if (v == null) {
      coords.push({ x, y: CHART_H, distKm: p.distKm, v: null });
      return;
    }
    const y = yFor(v);
    coords.push({ x, y, distKm: p.distKm, v });
    linePath += `${linePath ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)} `;
  });
  const areaPath = linePath ? `${linePath}L${CHART_W} ${CHART_H} L0 ${CHART_H} Z` : '';

  const yTicks = evenTicks(axisMin, axisMax).map((v) => {
    const norm = (v - axisMin) / range;
    const heightFrac = invert ? 1 - norm : norm;
    return { value: v, topPct: (1 - heightFrac) * 100 };
  });

  const step = niceKmStep(totalKm);
  const xTicks: number[] = [];
  for (let d = 0; d <= totalKm + 1e-6; d += step) xTicks.push(Math.round(d * 100) / 100);
  if (xTicks.length === 0 || totalKm - xTicks[xTicks.length - 1] > step * 0.4) xTicks.push(Math.round(totalKm * 100) / 100);

  function handleMove(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const targetKm = relX * totalKm;
    let nearest = 0;
    let nearestDist = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.distKm - targetKm);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    });
    setHover(nearest);
  }

  const hoverPoint = hover != null ? coords[hover] : null;

  return (
    <div className="stream-chart-row">
      <div className="stream-chart-plot" onPointerMove={handleMove} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" className="stream-chart">
          {areaPath && <path d={areaPath} fill={color} opacity={0.12} stroke="none" />}
          {linePath && (
            <path d={linePath} fill="none" stroke={color} strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
          )}
          {hoverPoint && (
            <line
              className="stream-crosshair-line"
              x1={hoverPoint.x}
              x2={hoverPoint.x}
              y1={0}
              y2={CHART_H}
              style={{ opacity: 1 }}
            />
          )}
        </svg>
        {hoverPoint && hoverPoint.v != null && (
          <div className="stream-tooltip" style={{ left: `${(hoverPoint.x / CHART_W) * 100}%`, opacity: 1 }}>
            {hoverPoint.distKm.toFixed(2)} km — {unitFmt(hoverPoint.v)}
          </div>
        )}
        <div className="stream-chart-xaxis">
          {xTicks.map((t, i) => (
            <span
              key={t}
              style={{
                left: `${(t / totalKm) * 100}%`,
                transform: i === 0 ? 'translateX(0)' : i === xTicks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
              }}
            >
              {Number.isInteger(t) ? t : t.toFixed(1)} km
            </span>
          ))}
        </div>
      </div>
      <div className="stream-chart-axis">
        {yTicks.map((t) => (
          <span key={t.value} style={{ top: `${t.topPct}%`, transform: 'translateY(-50%)' }}>
            {unitFmt(t.value)}
          </span>
        ))}
      </div>
    </div>
  );
}
