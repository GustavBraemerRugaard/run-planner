import { useEffect, useState } from 'react';
import { formatPace, newStep, parsePace, type Rest, type RestType, type Step } from '../domain/run';

interface Props {
  step: Step;
  /** Whether a rep count / rest makes sense here (false for warm-up / cool-down). */
  allowReps: boolean;
  onChange: (step: Step) => void;
  onRemove?: () => void;
}

/** Up to `decimals` places after a "." or ",", digits only otherwise. Comma is accepted while typing. */
function numberPattern(decimals: number): RegExp {
  return new RegExp(`^\\d*([.,]\\d{0,${decimals}})?$`);
}

function formatNumber(n: number, decimals: number): string {
  const rounded = Math.round(n * 10 ** decimals) / 10 ** decimals;
  return String(rounded).replace('.', ',');
}

/**
 * A decimal-friendly number input: keeps what you're typing (including a trailing "," or a partial
 * fraction like "1,2") in its own local state, instead of a plain controlled input that re-formats
 * the value — and therefore erases what you just typed — on every keystroke.
 *
 * The local text only gets overwritten from `value` when `value` says something the text does NOT
 * already say (e.g. switching the distance unit, or loading a different run) — never merely because
 * the parent round-tripped our own edit (e.g. an emptied field being stored as 0).
 */
function NumberField({
  value,
  onChange,
  placeholder,
  width,
  decimals = 2,
}: {
  value: number | '';
  onChange: (v: number | '') => void;
  placeholder?: string;
  width?: number;
  decimals?: number;
}) {
  const [text, setText] = useState(value === '' ? '' : formatNumber(value, decimals));

  useEffect(() => {
    const normalized = text.replace(',', '.');
    const parsed = normalized === '' || normalized === '.' ? 0 : parseFloat(normalized);
    const textAlreadyMatches =
      value === '' ? text === '' : Number.isFinite(parsed) && formatNumber(parsed, decimals) === formatNumber(value, decimals);
    if (!textAlreadyMatches) setText(value === '' ? '' : formatNumber(value, decimals));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      inputMode="decimal"
      style={width ? { width } : undefined}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value;
        if (!numberPattern(decimals).test(raw)) return; // reject the keystroke, keep prior text
        setText(raw);
        const normalized = raw.replace(',', '.');
        if (normalized === '' || normalized === '.') {
          onChange('');
          return;
        }
        const n = parseFloat(normalized);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setText(value === '' ? '' : formatNumber(value, decimals))}
    />
  );
}

/** A small segmented toggle button group — used everywhere in place of a <select> dropdown. */
function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <span className="seg-toggle">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/** One row: reps x distance @ pace (rest), or for WU/CD just distance @ pace. Distance can be entered in km or m. */
export default function StepEditor({ step, allowReps, onChange, onRemove }: Props) {
  const [distUnit, setDistUnit] = useState<'km' | 'm'>('km');
  const set = (patch: Partial<Step>) => onChange({ ...step, ...patch });

  const restType: RestType = step.rest?.type ?? 'distance';
  const restValue = step.rest?.value;
  const restPace = step.rest?.paceSecPerKm ?? null;

  function setRest(patch: Partial<Rest>) {
    const type = patch.type ?? restType;
    const value = patch.value ?? restValue;
    const paceSecPerKm = patch.paceSecPerKm !== undefined ? patch.paceSecPerKm : restPace;
    set({ rest: value != null && value > 0 ? { type, value, paceSecPerKm } : null });
  }

  const displayDistance = distUnit === 'km' ? step.distanceKm : step.distanceKm * 1000;

  return (
    <div className="step-row">
      {allowReps && (
        <>
          <NumberField
            width={44}
            decimals={0}
            value={step.reps}
            onChange={(v) => set({ reps: v === '' ? 1 : Math.max(1, Math.round(v)) })}
          />
          <span className="step-x">x</span>
        </>
      )}
      <NumberField
        width={64}
        value={displayDistance}
        placeholder="0"
        onChange={(v) => set({ distanceKm: v === '' ? 0 : distUnit === 'km' ? v : v / 1000 })}
      />
      <ToggleGroup
        options={[
          { value: 'km', label: 'km' },
          { value: 'm', label: 'm' },
        ]}
        value={distUnit}
        onChange={setDistUnit}
      />
      <span className="step-at">@</span>
      <input
        className="step-pace"
        placeholder="mm:ss"
        defaultValue={step.paceSecPerKm != null ? formatPace(step.paceSecPerKm) : ''}
        onBlur={(e) => {
          const v = e.target.value.trim();
          set({ paceSecPerKm: v === '' ? null : parsePace(v) });
        }}
      />
      <span className="step-unit">/km</span>

      {allowReps && step.reps > 1 && (
        <span className="step-rest">
          <span className="step-rest-mode">
            <ToggleGroup
              options={[
                { value: 'distance', label: 'Dist' },
                { value: 'time', label: 'Time' },
              ]}
              value={restType}
              onChange={(type) => setRest({ type })}
            />
          </span>
          <NumberField
            width={52}
            value={restValue ?? ''}
            placeholder={restType === 'distance' ? 'm' : 'sec'}
            decimals={0}
            onChange={(v) => setRest({ value: v === '' ? undefined : v })}
          />
          <span className="step-unit">{restType === 'distance' ? 'm' : 'sec'}</span>
          <span className="step-at">@</span>
          <input
            className="step-pace"
            placeholder="mm:ss"
            defaultValue={restPace != null ? formatPace(restPace) : ''}
            onBlur={(e) => {
              const v = e.target.value.trim();
              setRest({ paceSecPerKm: v === '' ? null : parsePace(v) });
            }}
          />
          <span className="step-unit">/km rest</span>
        </span>
      )}

      {onRemove && (
        <button type="button" className="step-remove" aria-label="Remove step" onClick={onRemove}>
          ✕
        </button>
      )}
    </div>
  );
}

export function newMainStep(): Step {
  return newStep('main');
}
