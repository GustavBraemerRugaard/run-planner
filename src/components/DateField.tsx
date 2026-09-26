import { useEffect, useRef, useState } from 'react';

interface Props {
  /** YYYY-MM-DD, local date. */
  value: string;
  onChange: (isoDate: string) => void;
}

/** "2026-09-14" -> "14/09/2026". */
function formatDisplay(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

/** Strips everything but digits and re-inserts the dd/mm/yyyy slashes as you type. */
function maskDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  let out = day;
  if (month) out += `/${month}`;
  if (year) out += `/${year}`;
  return out;
}

/** "14/09/2026" -> "2026-09-14", or null if incomplete/not a real calendar date. */
function isoFromDisplay(display: string): string | null {
  const m = display.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${year}-${p(month)}-${p(day)}`;
}

/**
 * A dd/mm/yyyy date field: a masked text input (always shown in that format, unlike the browser's
 * locale-dependent native date input) plus a small calendar button that opens the native date picker
 * as a picking convenience — not a dropdown, just a calendar popup — and writes back through the
 * same mask. `onChange` only ever fires with a complete, real calendar date.
 */
export default function DateField({ value, onChange }: Props) {
  const [text, setText] = useState(formatDisplay(value));
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Only overwrite what's being typed if it doesn't already represent `value` (same rule as the
    // step editor's NumberField): don't clobber input while the user is mid-edit.
    if (isoFromDisplay(text) !== value) setText(formatDisplay(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span className="date-field">
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={text}
        onChange={(e) => {
          const masked = maskDigits(e.target.value);
          setText(masked);
          const iso = isoFromDisplay(masked);
          if (iso) onChange(iso);
        }}
        onBlur={() => setText(formatDisplay(value))}
      />
      <button
        type="button"
        className="date-field-pick"
        aria-label="Pick a date"
        onClick={() => {
          const el = pickerRef.current;
          if (!el) return;
          if (typeof el.showPicker === 'function') el.showPicker();
          else el.click();
        }}
      >
        📅
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="date-field-native"
        tabIndex={-1}
        value={value}
        onChange={(e) => {
          if (e.target.value) {
            setText(formatDisplay(e.target.value));
            onChange(e.target.value);
          }
        }}
      />
    </span>
  );
}
