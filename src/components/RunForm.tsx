import { useMemo, useState } from 'react';
import StepEditor, { newMainStep } from './StepEditor';
import {
  RUN_TYPES,
  RUN_TYPE_ORDER,
  averagePaceSecPerKm,
  buildDescription,
  buildTitle,
  formatKm,
  formatPace,
  newStep,
  totalDistanceKm,
  type Run,
  type RunType,
  type Step,
} from '../domain/run';

interface Props {
  run: Run;
  saving: boolean;
  onSave: (run: Run) => void;
  onDelete?: (run: Run) => void;
  onCancel: () => void;
}

export default function RunForm({ run, saving, onSave, onDelete, onCancel }: Props) {
  const [type, setType] = useState<RunType>(run.type);
  const [date, setDate] = useState(run.date);
  const [warmup, setWarmup] = useState<Step | null>(run.steps.find((s) => s.kind === 'warmup') ?? null);
  const [cooldown, setCooldown] = useState<Step | null>(run.steps.find((s) => s.kind === 'cooldown') ?? null);
  const [mainSteps, setMainSteps] = useState<Step[]>(
    run.steps.filter((s) => s.kind === 'main').length > 0 ? run.steps.filter((s) => s.kind === 'main') : [newMainStep()],
  );
  const [description, setDescription] = useState(run.description);
  const [descTouched, setDescTouched] = useState(run.description !== run.autoDescription);

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
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{run.id ? 'Edit run' : 'New run'}</h2>

        <div className="field">
          <span className="label">Type</span>
          <div className="chips">
            {RUN_TYPE_ORDER.map((t) => (
              <button
                key={t}
                type="button"
                className={`chip ${t === type ? 'active' : ''}`}
                style={{ '--chip': RUN_TYPES[t].color } as React.CSSProperties}
                onClick={() => setType(t)}
              >
                {RUN_TYPES[t].label}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="label">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>

        <div className="field">
          <div className="steps-head">
            <span className="label">Steps</span>
            <div className="steps-toggles">
              <label className="check small">
                <input
                  type="checkbox"
                  checked={!!warmup}
                  onChange={(e) => setWarmup(e.target.checked ? newStep('warmup') : null)}
                />
                Warm-up
              </label>
              <label className="check small">
                <input
                  type="checkbox"
                  checked={!!cooldown}
                  onChange={(e) => setCooldown(e.target.checked ? newStep('cooldown') : null)}
                />
                Cool-down
              </label>
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
    </div>
  );
}
