import { useEffect, useMemo, useRef, useState } from 'react';
import StepEditor, { newMainStep } from './StepEditor';
import RunContextPanel from './RunContextPanel';
import DateField from './DateField';
import { saveStandardModalHeight } from '../lib/modalSize';
import {
  RUN_TYPES,
  RUN_TYPE_ORDER,
  averagePaceSecPerKm,
  buildDescription,
  buildRunFormWeekContext,
  buildTitle,
  computeTrainingLoad,
  formatKm,
  formatPace,
  newStep,
  overlayDraftRun,
  parseLocalDate,
  totalDistanceKm,
  type DayEntries,
  type Run,
  type RunType,
  type Step,
} from '../domain/run';

interface Props {
  run: Run;
  dayEntries: Map<string, DayEntries>;
  firstDay: number;
  saving: boolean;
  onSave: (run: Run) => void;
  onDelete?: (run: Run) => void;
  onCancel: () => void;
}

export default function RunForm({ run, dayEntries, firstDay, saving, onSave, onDelete, onCancel }: Props) {
  const [type, setType] = useState<RunType>(run.type);
  const [date, setDate] = useState(run.date);
  const [warmup, setWarmup] = useState<Step | null>(run.steps.find((s) => s.kind === 'warmup') ?? null);
  const [cooldown, setCooldown] = useState<Step | null>(run.steps.find((s) => s.kind === 'cooldown') ?? null);
  const [mainSteps, setMainSteps] = useState<Step[]>(
    run.steps.filter((s) => s.kind === 'main').length > 0 ? run.steps.filter((s) => s.kind === 'main') : [newMainStep()],
  );
  const modalRef = useRef<HTMLFormElement | null>(null);
  const [matchHeight, setMatchHeight] = useState<number | undefined>(undefined);

  // On desktop (side-by-side layout) this form and the context panel share one fixed height, measured
  // once — not continuously re-measured as the form's own content changes (adding/removing a step, a
  // warm-up/cool-down toggle, etc.) — so the two boxes never visibly grow or shrink while you're editing;
  // instead, content beyond that fixed height scrolls internally (`.modal`'s own `overflow-y: auto`).
  // The height is (re-)measured only when it's actually meant to change: once at mount (this run's
  // initial content decides the box size, same as before), when the layout crosses the 900px breakpoint
  // (mobile stacks instead, where no matching applies at all), and on a plain window resize (which can
  // change the effective `max-height: 92vh` cap). Below 900px, no matching is applied — each box just
  // sizes to its own natural stacked content, same as before.
  //
  // The measured height is also persisted as the app-wide "standard" popup height (see lib/modalSize.ts),
  // so single-panel popups like the activity-detail view — never open at the same time as this one — can
  // match it too.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const el = modalRef.current;
    if (!el) return;
    const measureNatural = (): number => {
      // Temporarily clear any previously-locked inline height so this measures the form's natural,
      // un-capped-by-us content height (still capped by the CSS `max-height: 92vh`), not whatever
      // height happened to be locked in before.
      const prevHeight = el.style.height;
      el.style.height = '';
      const height = el.getBoundingClientRect().height;
      el.style.height = prevHeight;
      return height;
    };
    const update = () => {
      if (mq.matches) {
        const height = measureNatural();
        setMatchHeight(height);
        saveStandardModalHeight(height);
      } else {
        setMatchHeight(undefined);
      }
    };
    update();
    mq.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      mq.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const steps = useMemo(
    () => [...(warmup ? [warmup] : []), ...mainSteps, ...(cooldown ? [cooldown] : [])],
    [warmup, mainSteps, cooldown],
  );
  const autoDescription = useMemo(() => buildDescription(steps), [steps]);
  const totalKm = totalDistanceKm(steps);
  const avgPace = averagePaceSecPerKm(steps);
  const title = buildTitle(type, steps);

  const invalid = steps.length === 0 || totalKm <= 0;

  const formContext = useMemo(
    () => buildRunFormWeekContext(dayEntries, firstDay, { date, type, steps }, run.id),
    [dayEntries, firstDay, date, type, steps, run.id],
  );
  // What this run would do to the acute:chronic training-load ratio if saved as currently edited —
  // computed "as of" the draft's own date, with the draft folded into dayEntries in place of its saved
  // counterpart (if any), so editing the type/steps/date live-updates the projected load below.
  const draftLoad = useMemo(() => {
    const overlaid = overlayDraftRun(dayEntries, { date, type, steps }, run.id);
    return computeTrainingLoad(overlaid, parseLocalDate(date));
  }, [dayEntries, date, type, steps, run.id]);

  function updateMain(i: number, s: Step) {
    setMainSteps((prev) => prev.map((p, idx) => (idx === i ? s : p)));
  }
  function removeMain(i: number) {
    setMainSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return;
    onSave({
      ...run,
      type,
      date,
      steps,
      description: autoDescription,
      autoDescription,
    });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-wrap" onClick={(e) => e.stopPropagation()}>
        <form className="modal" ref={modalRef} onSubmit={submit} style={matchHeight ? { height: matchHeight } : undefined}>
          <h2>
            {title}
            <span className="modal-tag">{run.id ? '(editing)' : '(new)'}</span>
          </h2>

          <div className="field">
            <span className="label">Type</span>
            <div className="chips">
              {RUN_TYPE_ORDER.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`chip ${t === type ? 'active' : ''}`}
                  style={{ '--chip': RUN_TYPES[t].color, '--chip-text': RUN_TYPES[t].textColor } as React.CSSProperties}
                  onClick={() => setType(t)}
                >
                  {RUN_TYPES[t].label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="label">Date</span>
            <DateField value={date} onChange={setDate} />
          </div>

          <div className="field">
            <div className="steps-head">
              <span className="label">Steps</span>
              <div className="seg-toggle">
                <button
                  type="button"
                  className={warmup ? 'active' : ''}
                  onClick={() => setWarmup(warmup ? null : newStep('warmup'))}
                >
                  Warm-up
                </button>
                <button
                  type="button"
                  className={cooldown ? 'active' : ''}
                  onClick={() => setCooldown(cooldown ? null : newStep('cooldown'))}
                >
                  Cool-down
                </button>
              </div>
            </div>

            <div className="steps">
              {warmup && <StepEditor step={warmup} allowReps={false} onChange={setWarmup} />}
              {mainSteps.map((s, i) => (
                <StepEditor
                  key={s.id}
                  step={s}
                  allowReps
                  onChange={(v) => updateMain(i, v)}
                  onRemove={mainSteps.length > 1 ? () => removeMain(i) : undefined}
                />
              ))}
              {cooldown && <StepEditor step={cooldown} allowReps={false} onChange={setCooldown} />}
            </div>
            <button type="button" className="btn small" onClick={() => setMainSteps((prev) => [...prev, newMainStep()])}>
              + Add step
            </button>
          </div>

          <div className="totals">
            <div>
              <span className="label">Total distance</span>
              <strong>{formatKm(totalKm)} km</strong>
            </div>
            <div>
              <span className="label">Avg. pace</span>
              <strong>{avgPace != null ? `${formatPace(avgPace)} /km` : '—'}</strong>
            </div>
          </div>

          <div className="actions">
            {run.id && onDelete && (
              <button
                type="button"
                className="btn danger"
                disabled={saving}
                onClick={() => {
                  if (window.confirm('Delete this run from your calendar?')) onDelete(run);
                }}
              >
                Delete
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="btn" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving || invalid}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>

        <RunContextPanel context={formContext} draftLoad={draftLoad} matchHeight={matchHeight} />
      </div>
    </div>
  );
}
