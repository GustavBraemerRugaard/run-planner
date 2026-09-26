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
  formatKm,
  formatPace,
  newStep,
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
  const [description, setDescription] = useState(run.description);
  const [descTouched, setDescTouched] = useState(run.description !== run.autoDescription);
  const modalRef = useRef<HTMLFormElement | null>(null);
  const [matchHeight, setMatchHeight] = useState<number | undefined>(undefined);

  // On desktop (side-by-side layout) the context panel should match this form's own height exactly
  // — not stretch the form to match the panel's, which left dead space below the form's buttons.
  // Below that breakpoint the two boxes stack, so no matching is applied there. The measured height is
  // also persisted as the app-wide "standard" popup height (see lib/modalSize.ts), so single-panel
  // popups like the activity-detail view — never open at the same time as this one — can match it too.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const el = modalRef.current;
    if (!el) return;
    const update = () => {
      const matches = mq.matches;
      const height = modalRef.current?.getBoundingClientRect().height;
      setMatchHeight(matches ? height : undefined);
      if (matches && height) saveStandardModalHeight(height);
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    mq.addEventListener('change', update);
    update();
    return () => {
      ro.disconnect();
      mq.removeEventListener('change', update);
    };
  }, []);

  const steps = useMemo(
    () => [...(warmup ? [warmup] : []), ...mainSteps, ...(cooldown ? [cooldown] : [])],
    [warmup, mainSteps, cooldown],
  );
  const autoDescription = useMemo(() => buildDescription(steps), [steps]);
  const shownDescription = descTouched ? description : autoDescription;
  const totalKm = totalDistanceKm(steps);
  const avgPace = averagePaceSecPerKm(steps);
  const title = buildTitle(type, steps);

  const invalid = steps.length === 0 || totalKm <= 0;

  const formContext = useMemo(
    () => buildRunFormWeekContext(dayEntries, firstDay, { date, type, steps }, run.id),
    [dayEntries, firstDay, date, type, steps, run.id],
  );

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
      description: shownDescription,
      autoDescription,
    });
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-wrap" onClick={(e) => e.stopPropagation()}>
        <form className="modal" ref={modalRef} onSubmit={submit}>
          <h2>{run.id ? 'Edit run' : 'New run'}</h2>

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

          <label className="field">
            <div className="steps-head">
              <span className="label">Calendar title (auto)</span>
            </div>
            <input value={title} disabled />
          </label>

          <label className="field">
            <div className="steps-head">
              <span className="label">Description</span>
              {descTouched && (
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    setDescription(autoDescription);
                    setDescTouched(false);
                  }}
                >
                  Reset to auto
                </button>
              )}
            </div>
            <textarea
              rows={4}
              value={shownDescription}
              onChange={(e) => {
                setDescription(e.target.value);
                setDescTouched(true);
              }}
            />
          </label>

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

        <RunContextPanel context={formContext} matchHeight={matchHeight} />
      </div>
    </div>
  );
}
