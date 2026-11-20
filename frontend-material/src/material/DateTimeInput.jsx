import { forwardRef, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import MaterialDialog from './MaterialDialog.jsx';
import { MaterialButton, MaterialIcon, MaterialInput } from './controls.jsx';
import { htmlLang } from '../utils/browserLanguage.js';

const narrowCalendar = '(max-width: 335px)';

const dateValue = date => `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseDate = value => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(2000, month - 1, day, 12);
  date.setFullYear(year);
  return date;
};

// The real date/time input remains the form, validation, ref and event target.
// Only its platform popup is replaced, so schedule timezone/DST rules stay with the caller.
const DateTimeInput = forwardRef(function DateTimeInput({ style, ...props }, ref) {
  const { t, i18n } = useTranslation();
  const input = useRef(null);
  const [open, setOpen] = useState(false);
  const id = useId();
  const label = props['aria-label'] || (props.type === 'time' ? t('compose.scheduleSend.timeLabel') : props.type === 'datetime-local' ? t('compose.scheduleSend.dateTimeLabel') : t('compose.scheduleSend.dateLabel'));
  const show = () => { if (!props.disabled && !props.readOnly) setOpen(true); };
  return <span className="md-date-field" style={{ width: style?.width, flex: style?.flex, minWidth: style?.minWidth }}>
    <MaterialInput {...props} aria-label={props['aria-label'] || (!props.id ? label : undefined)}
      ref={node => { input.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }}
      style={{ ...style, width: '100%' }} aria-haspopup="dialog" aria-controls={open ? id : undefined}
      onClick={event => { props.onClick?.(event); if (!event.defaultPrevented) { event.preventDefault(); show(); } }}
      onKeyDown={event => {
        props.onKeyDown?.(event);
        if (!event.defaultPrevented && (event.key === ' ' || event.key === 'F4' || (event.altKey && event.key === 'ArrowDown'))) {
          event.preventDefault(); show();
        }
      }} />
    <MaterialButton type="button" variant="icon" aria-label={`${label}: ${t('materialPicker.open')}`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} disabled={props.disabled || props.readOnly}
      onClick={show}><MaterialIcon name={props.type === 'time' ? 'schedule' : 'calendar_month'} /></MaterialButton>
    {open && createPortal(<Picker id={id} input={input.current} label={label} locale={htmlLang(i18n.resolvedLanguage || i18n.language || 'en')} onClose={() => setOpen(false)} />,
      input.current.ownerDocument.body)}
  </span>;
});

function Picker({ id, input, label, locale, onClose }) {
  const { t } = useTranslation();
  const hasDate = input.type !== 'time';
  const hasTime = input.type !== 'date';
  const today = dateValue(new Date());
  const minDate = hasDate ? input.min.slice(0, 10) : '';
  const maxDate = hasDate ? input.max.slice(0, 10) : '';
  const initialDate = input.value.slice(0, 10) || (minDate > today ? minDate : maxDate && maxDate < today ? maxDate : today);
  const initialTime = (input.type === 'time' ? input.value : input.value.split('T')[1]) || '09:00';
  const [date, setDate] = useState(initialDate);
  const [month, setMonth] = useState(initialDate.slice(0, 7));
  const [hour, setHour] = useState(initialTime.slice(0, 2));
  const [minute, setMinute] = useState(initialTime.slice(3, 5));
  // Seven adjacent 48px day targets need at least 336px.
  const [narrow, setNarrow] = useState(() => Boolean(input.ownerDocument.defaultView.matchMedia?.(narrowCalendar).matches));
  const [textMode, setTextMode] = useState(false);
  const showDateText = narrow || textMode;
  useLayoutEffect(() => {
    const media = input.ownerDocument.defaultView.matchMedia?.(narrowCalendar);
    const onChange = event => setNarrow(event.matches);
    media?.addEventListener?.('change', onChange);
    return () => media?.removeEventListener?.('change', onChange);
  }, [input]);
  const [error, setError] = useState('');
  const calendar = useRef(null);
  const pendingFocus = useRef(null);
  const dateText = useRef(null);
  const previousDateView = useRef(showDateText);
  useLayoutEffect(() => {
    if (previousDateView.current === showDateText) return;
    previousDateView.current = showDateText;
    const field = showDateText ? dateText.current : calendar.current?.querySelector('[tabindex="0"]');
    field?.focus();
  }, [showDateText]);
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    calendar.current?.querySelector(`[data-date="${pendingFocus.current}"]`)?.focus();
    pendingFocus.current = null;
  }, [date, month]);
  const pad = value => String(value).padStart(2, '0');
  const time = `${pad(hour)}:${pad(minute)}`;
  const value = hasDate ? `${date}${hasTime ? `T${time}` : ''}` : time;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && dateValue(parseDate(date)) === date;
  const validTime = /^\d{1,2}$/.test(hour) && Number(hour) < 24 && /^\d{1,2}$/.test(minute) && Number(minute) < 60;
  const probe = input.cloneNode();
  probe.removeAttribute('id');
  probe.value = value;
  const valid = (!hasDate || validDate) && (!hasTime || validTime) && probe.value === value && probe.checkValidity();
  const commit = next => {
    if (next !== '' && !valid) { setError(probe.validationMessage || t('compose.scheduleSend.errors.invalid')); return; }
    const setter = Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView.HTMLInputElement.prototype, 'value').set;
    setter.call(input, next);
    input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
    input.dispatchEvent(new input.ownerDocument.defaultView.Event('change', { bubbles: true }));
    onClose();
  };
  let firstDay = /^(en-US|en$|ja|ko|zh)/i.test(locale) ? 0 : 1;
  try {
    const calendarLocale = new Intl.Locale(locale);
    const week = calendarLocale.getWeekInfo?.() || calendarLocale.weekInfo;
    if (week) firstDay = week.firstDay % 7;
  } catch { /* Keep the language fallback for runtimes without Intl.Locale. */ }
  const current = parseDate(`${month}-01`);
  const weekdays = Array.from({ length: 7 }, (_, index) => new Date(2023, 0, 1 + (firstDay + index) % 7, 12));
  const offset = (current.getDay() - firstDay + 7) % 7;
  const count = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
  const available = day => (!minDate || day >= minDate) && (!maxDate || day <= maxDate);
  const moveMonth = delta => {
    const next = parseDate(`${month}-01`); next.setMonth(next.getMonth() + delta);
    setMonth(dateValue(next).slice(0, 7));
  };
  const focusDate = next => {
    let day = dateValue(next);
    if (minDate && day < minDate) day = minDate;
    if (maxDate && day > maxDate) day = maxDate;
    pendingFocus.current = day;
    setDate(day); setMonth(day.slice(0, 7));
  };
  const calendarKey = event => {
    const day = event.target.dataset.date;
    if (!day) return;
    const next = parseDate(day);
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (steps[event.key]) next.setDate(next.getDate() + steps[event.key]);
    else if (event.key === 'Home') next.setDate(next.getDate() - (next.getDay() - firstDay + 7) % 7);
    else if (event.key === 'End') next.setDate(next.getDate() + 6 - (next.getDay() - firstDay + 7) % 7);
    else if (event.key === 'PageUp' || event.key === 'PageDown') {
      const dayNumber = next.getDate(); next.setDate(1);
      next.setMonth(next.getMonth() + (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1));
      next.setDate(Math.min(dayNumber, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    } else return;
    event.preventDefault(); focusDate(next);
  };
  return <div className="md-picker-scrim" data-date-picker="" onMouseDown={event => { event.stopPropagation(); if (event.target === event.currentTarget) onClose(); }}
    onClick={event => event.stopPropagation()}>
    <MaterialDialog id={id} className="md-picker" onClose={onClose} aria-labelledby={`${id}-title`} aria-describedby={error ? `${id}-error` : undefined}
      onKeyDown={event => {
        if (event.key === 'Tab') return;
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); onClose(); }
        else if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
          event.preventDefault(); if (!event.ctrlKey && !event.metaKey && !event.repeat) commit(value);
        }
      }}>
      <header className="md-picker-header">
        <h2 id={`${id}-title`}>{label}</h2>
        {hasDate && <div className="md-picker-headline"><span>{validDate ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', weekday: 'short' }).format(parseDate(date)) : t('compose.scheduleSend.dateLabel')}</span>
          {!narrow && <MaterialButton type="button" variant="icon" aria-label={t(textMode ? 'materialPicker.calendar' : 'materialPicker.typeDate')}
            onClick={() => setTextMode(!textMode)}><MaterialIcon name={textMode ? 'calendar_month' : 'edit'} /></MaterialButton>}</div>}
      </header>
      {hasDate && (showDateText ? <div className="md-picker-date-text"><label className="md-field-label" htmlFor={`${id}-date`}>{t('compose.scheduleSend.dateLabel')}</label>
        <MaterialInput ref={dateText} data-autofocus="" id={`${id}-date`} type="text" placeholder="YYYY-MM-DD" value={date} aria-invalid={!validDate || undefined}
          aria-describedby={`${id}-date-format`} onChange={event => { const next = event.target.value; setDate(next); if (/^\d{4}-\d{2}-\d{2}$/.test(next) && dateValue(parseDate(next)) === next) setMonth(next.slice(0, 7)); }} />
        <span id={`${id}-date-format`} className="md-supporting-text">YYYY-MM-DD</span></div> : <div className="md-picker-calendar" ref={calendar} onKeyDown={calendarKey}>
        <div className="md-picker-month"><span aria-live="polite">{new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(current)}</span>
          <MaterialButton type="button" variant="icon" aria-label={t('materialPicker.previousMonth')} disabled={Boolean(minDate && month <= minDate.slice(0, 7))} onClick={() => moveMonth(-1)}><MaterialIcon name="chevron_left" /></MaterialButton>
          <MaterialButton type="button" variant="icon" aria-label={t('materialPicker.nextMonth')} disabled={Boolean(maxDate && month >= maxDate.slice(0, 7))} onClick={() => moveMonth(1)}><MaterialIcon name="chevron_right" /></MaterialButton></div>
        <table aria-label={t('materialPicker.calendar')}><thead><tr>{weekdays.map(day => <th key={day.getDay()} scope="col" aria-label={new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(day)}>{new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(day)}</th>)}</tr></thead>
          <tbody>{Array.from({ length: Math.ceil((count + offset) / 7) }, (_, week) => <tr key={week}>{Array.from({ length: 7 }, (_, column) => {
            const day = week * 7 + column - offset + 1;
            if (day < 1 || day > count) return <td key={column} />;
            const key = `${month}-${pad(day)}`;
            const tabDate = date.slice(0, 7) === month && available(date) ? date : minDate?.slice(0, 7) === month ? minDate : `${month}-01`;
            return <td key={column}><MaterialButton type="button" variant="date" data-date={key} data-today={key === today || undefined}
              aria-label={new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(parseDate(key))} aria-pressed={date === key}
              aria-current={key === today ? 'date' : undefined} disabled={!available(key)} tabIndex={key === tabDate ? 0 : -1}
              data-autofocus={key === tabDate ? '' : undefined} onClick={() => { setDate(key); setError(''); }}>{day}</MaterialButton></td>;
          })}</tr>)}</tbody></table>
      </div>)}
      {hasTime && <div className="md-picker-time" role="group" aria-label={t('compose.scheduleSend.timeLabel')}>
        <label><MaterialInput type="text" inputMode="numeric" maxLength={2} value={hour} aria-label={t('materialPicker.hour')} aria-invalid={!validTime || undefined}
          onChange={event => setHour(event.target.value)} onFocus={event => event.target.select()} /><span>{t('materialPicker.hour')}</span></label>
        <span className="md-picker-colon" aria-hidden="true">:</span>
        <label><MaterialInput type="text" inputMode="numeric" maxLength={2} value={minute} aria-label={t('materialPicker.minute')} aria-invalid={!validTime || undefined}
          onChange={event => setMinute(event.target.value)} onFocus={event => event.target.select()} /><span>{t('materialPicker.minute')}</span></label>
      </div>}
      {error && <p id={`${id}-error`} className="md-picker-error" role="alert">{error}</p>}
      <footer className="md-picker-actions">
        {!input.required && <MaterialButton type="button" variant="text" onClick={() => commit('')}>{t('materialPicker.clear')}</MaterialButton>}
        <span />
        <MaterialButton type="button" variant="text" onClick={onClose}>{t('common.cancel')}</MaterialButton>
        <MaterialButton type="button" variant="text" onClick={() => commit(value)}>{t('compose.toolbar.apply')}</MaterialButton>
      </footer>
    </MaterialDialog>
  </div>;
}

export default DateTimeInput;
