import DateTimeInput from '../material/DateTimeInput.jsx';
import { useModalFocus } from '../material/useModalFocus.js';
import { MaterialIcon } from '../material/controls.jsx';
import { MaterialButton } from '../material/controls.jsx';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  browserTimeZone, checkSendAt, dateBounds, defaultCustom, formatSendAt, localDateTimeValue, localDateValue,
  localTimeValue, presets, resolveCustom, resolveLocalDateTime,
} from '../utils/scheduleTimes.js';

// The composer's Send later (#543, design 5.1 and 5.4): the menu of the split Send button on
// desktop, the sheet behind the clock button on phones, the date and time picker both share, the
// strip a scheduled message shows while it is edited, and the dialogs scheduling asks with.

const PRESET_LABELS = {
  laterToday: 'compose.scheduleSend.laterToday',
  tomorrowMorning: 'compose.scheduleSend.tomorrowMorning',
  tomorrowAfternoon: 'compose.scheduleSend.tomorrowAfternoon',
  mondayMorning: 'compose.scheduleSend.mondayMorning',
};

const PROBLEM_TEXT = {
  invalid: 'compose.scheduleSend.errors.invalid',
  past: 'compose.scheduleSend.errors.past',
  tooSoon: 'compose.scheduleSend.errors.tooSoon',
  tooFar: 'compose.scheduleSend.errors.tooFar',
};

const clockIcon = (size = 14) => (
  <MaterialIcon name="schedule" size={size} />
);
export const SendLaterIcon = ({ size = 14 }) => clockIcon(size);

const fieldStyle = (mobile) => ({
  width: '100%', boxSizing: 'border-box', background: 'var(--bg-hover)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text-primary)', fontSize: mobile ? 16 : 13,
  padding: mobile ? '10px 10px' : '6px 8px', outline: 'none', colorScheme: 'dark light',
  minHeight: mobile ? 44 : undefined,
});
const labelStyle = { display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 };

// Ctrl/Cmd+Enter, with or without Shift: the composer's Send and Send later. Inside these menus,
// sheets and dialogs it never reaches the composer, which would send at once.
const isSendKey = e => e.key === 'Enter' && !e.altKey && (e.ctrlKey || e.metaKey);
// A held Enter or Space repeats its keydown, and each one would click the focused button again.
const ignoreRepeat = (e) => { if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault(); };
const swallowSendKey = (e) => {
  if (!isSendKey(e)) return false;
  e.preventDefault();
  e.stopPropagation();
  return true;
};

// Picks a date and a time, in the browser's time zone. `variant` 'split' has a date and a time
// input (desktop, as the snooze picker), 'single' one datetime-local input. Both use the
// Material popup while retaining native form values. The server decides the limits.
// Ctrl/Cmd+Enter anywhere in it, and Enter in an input, confirm the time as its button does.
export function SchedulePicker({ variant = 'split', now, onSubmit, submitLabel, busy = false, autoFocus = true }) {
  const { t } = useTranslation();
  const id = useId();
  const opened = useMemo(() => now ?? new Date(), [now]);
  const start = defaultCustom(opened);
  const [date, setDate] = useState(() => localDateValue(start));
  const [time, setTime] = useState(() => localTimeValue(start));
  const [dateTime, setDateTime] = useState(() => localDateTimeValue(start));
  const firstRef = useRef(null);
  useEffect(() => { if (autoFocus) firstRef.current?.focus(); }, [autoFocus]);

  const at = variant === 'single' ? resolveLocalDateTime(dateTime) : resolveCustom(date, time);
  const problem = checkSendAt(at, now ?? new Date());
  const bounds = dateBounds(opened);
  const zone = browserTimeZone();
  const statusId = `${id}-status`;
  const mobile = variant === 'single';

  const submit = () => { if (!problem && !busy) onSubmit(at); };
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || e.altKey) return;
    if (!isSendKey(e) && e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) submit();
  };

  return (
    <form
      onSubmit={e => { e.preventDefault(); submit(); }}
      onKeyDown={onKeyDown}
      style={{ padding: mobile ? '12px 20px 4px' : '10px 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      {variant === 'single' ? (
        <div>
          <label htmlFor={`${id}-dt`} style={labelStyle}>{t('compose.scheduleSend.dateTimeLabel')}</label>
          <DateTimeInput
            ref={firstRef} id={`${id}-dt`} type="datetime-local" value={dateTime} step={60}
            min={`${bounds.min}T00:00`} max={`${bounds.max}T23:59`}
            aria-invalid={problem ? 'true' : undefined} aria-describedby={statusId}
            onChange={e => setDateTime(e.target.value)} style={fieldStyle(true)}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 168 }}>
            <label htmlFor={`${id}-date`} style={labelStyle}>{t('compose.scheduleSend.dateLabel')}</label>
            <DateTimeInput
              ref={firstRef} id={`${id}-date`} type="date" value={date} min={bounds.min} max={bounds.max}
              aria-invalid={problem ? 'true' : undefined} aria-describedby={statusId}
              onChange={e => setDate(e.target.value)} style={fieldStyle(false)}
            />
          </div>
          <div style={{ width: 176, flexShrink: 0 }}>
            <label htmlFor={`${id}-time`} style={labelStyle}>{t('compose.scheduleSend.timeLabel')}</label>
            <DateTimeInput
              id={`${id}-time`} type="time" value={time} step={60}
              aria-invalid={problem ? 'true' : undefined} aria-describedby={statusId}
              onChange={e => setTime(e.target.value)} style={fieldStyle(false)}
            />
          </div>
        </div>
      )}
      <div id={statusId} aria-live="polite" data-schedule-status=""
        style={{ fontSize: 12, minHeight: 16, color: problem ? 'var(--red)' : 'var(--text-secondary)' }}>
        {problem ? t(PROBLEM_TEXT[problem]) : t('compose.scheduleSend.sendsAt', { when: formatSendAt(at, undefined, opened) })}
      </div>
      {zone && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t('compose.scheduleSend.timeZone', { zone })}</div>}
      <MaterialButton variant="filled"
        type="submit" disabled={Boolean(problem) || busy}
        style={{
          width: '100%', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 6,
          padding: mobile ? '12px 0' : '7px 0', minHeight: mobile ? 44 : undefined, fontSize: mobile ? 15 : 13, fontWeight: 500,
          cursor: problem || busy ? 'default' : 'pointer', opacity: problem || busy ? 0.5 : 1,
        }}
      >
        {submitLabel || t('compose.scheduleSend.schedule')}
      </MaterialButton>
    </form>
  );
}

// Keeps Tab and Shift+Tab inside a modal (`box`), wrapping at either end, as aria-modal promises.
export function trapTab(e, box) {
  if (e.key !== 'Tab' || !box) return;
  const focusable = [...box.querySelectorAll('button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && el.getAttribute('aria-hidden') !== 'true');
  if (!focusable.length) { e.preventDefault(); return; }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
}

const menuItemStyle = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px',
  background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer',
  fontSize: 13, color: 'var(--text-primary)', outline: 'none',
};


const separator = <div role="separator" style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />;
const chevronRight = (
  <MaterialIcon name="chevron_right" size={12} />
);
const calendarIcon = (
  <MaterialIcon name="calendar_month" size={14} />
);

// The desktop menu, opened from the split Send button's chevron (`triggerRef`). It is an ARIA
// menu: arrow keys, Home and End move, Escape closes it and gives focus back to the chevron, Tab
// leaves it. "Pick date and time" turns it into a small dialog with the picker. `onPick(date)`
// schedules.
//
// Editing a scheduled message (`editing`), its first level is Send now, Change time and
// Unschedule (design 5.1); Change time opens the times, as `initialView` 'times' does (the strip's
// Change). Escape goes back one level, and from the first one shown it closes. Choosing an item
// gives focus back to the chevron, so a choice that fails leaves it somewhere sensible.
//
// The Scheduled view's Reschedule uses the times alone, with its own `title` and `submitLabel`,
// opening below its row (`placement` 'below').
export function SendLaterMenu({
  triggerRef, onClose, onPick, editing = false, onUnschedule, onSendNow, initialView = 'root', now: nowProp, busy = false,
  title, submitLabel, placement = 'above',
}) {
  const { t } = useTranslation();
  const now = useMemo(() => nowProp ?? new Date(), [nowProp]);
  const firstView = editing && initialView === 'root' ? 'root' : 'times';
  const [view, setView] = useState(firstView);
  const boxRef = useRef(null);
  // The item to focus when a level comes back (the one that left it).
  const returnToRef = useRef(null);
  const items = presets(now);

  const close = (refocus = true) => {
    onClose();
    if (refocus) triggerRef?.current?.focus();
  };
  const back = () => {
    if (view === 'pick') setView('times');
    else if (view === 'times' && firstView === 'root') setView('root');
    else close();
  };

  // Editing, the first level opens on Change time, not Send now, which sends at once.
  useEffect(() => {
    if (view === 'pick') return;
    const list = [...(boxRef.current?.querySelectorAll('[role="menuitem"]') || [])];
    const target = list.find(el => el.dataset.preset === (returnToRef.current || (view === 'root' ? 'changeTime' : null))) || list[0];
    returnToRef.current = null;
    target?.focus();
  }, [view]);

  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current?.contains(e.target) || triggerRef?.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose, triggerRef]);

  const onMenuKeyDown = (e) => {
    const list = [...(boxRef.current?.querySelectorAll('[role="menuitem"]') || [])];
    const at = list.indexOf(document.activeElement);
    const move = (i) => { e.preventDefault(); list[(i + list.length) % list.length]?.focus(); };
    if (e.key === 'ArrowDown') move(at + 1);
    else if (e.key === 'ArrowUp') move(at < 0 ? list.length - 1 : at - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(list.length - 1);
    else if (isSendKey(e)) { e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (view === 'times' && firstView === 'root') { returnToRef.current = 'changeTime'; setView('root'); } else close();
    } else if (e.key === 'Tab') close(false);
  };

  const onPickKeyDown = (e) => {
    if (swallowSendKey(e) || e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    returnToRef.current = 'pick';
    setView('times');
  };

  const item = (key, label, onClick, { icon, detail, more } = {}) => (
    <MaterialButton variant="menu" key={key} type="button" role="menuitem" tabIndex={-1} disabled={busy} data-preset={key}
      {...(more ? { 'aria-haspopup': more } : {})} onClick={onClick} onKeyDown={ignoreRepeat} style={menuItemStyle} >
      {icon && <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}>{icon}</span>}
      <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{label}</span>
      {detail && <span style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{detail}</span>}
      {more === 'menu' && <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}>{chevronRight}</span>}
    </MaterialButton>
  );
  const heading = (text) => (
    <div aria-hidden="true" style={{ padding: '6px 14px 4px', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {text}
    </div>
  );

  return (
    <div
      ref={boxRef}
      style={{
        position: 'absolute', ...(placement === 'below' ? { top: 'calc(100% + 4px)', right: 0 } : { bottom: 'calc(100% + 6px)', left: 0 }), zIndex: 20,
        width: 320, maxWidth: 'calc(100vw - 32px)', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', overflow: 'hidden', padding: view === 'pick' ? 0 : '4px 0',
      }}
    >
      {view === 'root' && (
        <div role="menu" aria-label={t('compose.scheduleSend.edit.options')} onKeyDown={onMenuKeyDown}>
          {item('sendNow', t('compose.scheduleSend.edit.sendNow'), () => { close(); onSendNow?.(); }, { icon: <SendNowIcon /> })}
          {item('changeTime', t('compose.scheduleSend.changeTime'), () => setView('times'), { icon: clockIcon(), more: 'menu' })}
          {separator}
          {item('unschedule', t('compose.scheduleSend.edit.unschedule'), () => { close(); onUnschedule?.(); })}
        </div>
      )}
      {view === 'times' && (
        <div role="menu" aria-label={title || (editing ? t('compose.scheduleSend.changeTime') : t('compose.scheduleSend.title'))} onKeyDown={onMenuKeyDown}>
          {heading(title || (editing ? t('compose.scheduleSend.changeTime') : t('compose.scheduleSend.title')))}
          {items.map(p => item(p.id, t(PRESET_LABELS[p.id]), () => { close(); onPick(p.at); },
            { icon: clockIcon(), detail: formatSendAt(p.at, undefined, now) }))}
          {separator}
          {item('pick', t('compose.scheduleSend.pick'), () => setView('pick'), { icon: calendarIcon, more: 'dialog' })}
        </div>
      )}
      {view === 'pick' && (
        <div role="dialog" aria-label={t('compose.scheduleSend.pick')} onKeyDown={onPickKeyDown}>
          <MaterialButton variant="text" type="button" onClick={() => { returnToRef.current = 'pick'; back(); }}
            style={{ ...menuItemStyle, gap: 8, fontSize: 12, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }} >
            <MaterialIcon name="chevron_left" size={12} />
            {t('common.back')}
          </MaterialButton>
          <SchedulePicker variant="split" now={nowProp} busy={busy}
            submitLabel={submitLabel || (editing ? t('compose.scheduleSend.edit.update') : t('compose.scheduleSend.schedule'))}
            onSubmit={at => { close(); onPick(at); }} />
        </div>
      )}
    </div>
  );
}

const SendNowIcon = () => (
  <MaterialIcon name="send" size={14} />
);

const sheetButton = {
  width: '100%', minHeight: 52, padding: '12px 20px', textAlign: 'left', background: 'none', border: 'none',
  borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: 16, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 12, WebkitTapHighlightColor: 'transparent',
};

// The phone sheet behind the composer's clock button: the same presets and picker, as a modal
// dialog, and for a scheduled message being edited Send now and Unschedule too. Focus goes to its
// first option and back to `returnFocusRef` when it closes.
export function SendLaterSheet({
  onClose, onPick, editing = false, onUnschedule, onSendNow, initialView = 'root', returnFocusRef, now: nowProp, busy = false,
  title, submitLabel,
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const now = useMemo(() => nowProp ?? new Date(), [nowProp]);
  const [picking, setPicking] = useState(false);
  const sheetRef = useModalFocus({ onEscape: onClose, returnFocusRef });
  const items = presets(now);
  // Editing, the strip's Change and "Pick a new time" open it at the times alone.
  const actions = editing && initialView !== 'times';

  // Focus starts on the first time, not on Send now, which sends at once.
  useEffect(() => {
    if (!picking) sheetRef.current?.querySelector('button:not([data-preset="sendNow"])')?.focus();
  }, [picking, sheetRef]);


  const choose = (at) => { onClose(); onPick(at); };

  return (
    <>
      <div data-modal-scrim="" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,0.4)' }} />
      <div
        ref={sheetRef} className="md-bottom-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } else if (!swallowSendKey(e)) trapTab(e, sheetRef.current);
        }}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 2101, background: 'var(--bg-elevated)',
          borderRadius: '16px 16px 0 0', paddingBottom: 'calc((var(--sab) + 8px) / var(--ui-scale, 1))', boxShadow: 'var(--shadow-modal)',
          animation: 'sheet-enter var(--md-sys-motion-default-spatial) both', overflowY: 'auto',
        }}
      >
        <div id={titleId} style={{ padding: '16px 20px 8px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}>
          {actions ? t('compose.scheduleSend.edit.options') : title || (editing ? t('compose.scheduleSend.changeTime') : t('compose.scheduleSend.title'))}
        </div>
        {picking ? (
          <SchedulePicker variant="single" now={nowProp} busy={busy}
            submitLabel={submitLabel || (editing ? t('compose.scheduleSend.edit.update') : t('compose.scheduleSend.schedule'))}
            onSubmit={choose} />
        ) : (
          <>
            {actions && (
              <>
                <MaterialButton variant="text" type="button" data-preset="sendNow" disabled={busy} onClick={() => { onClose(); onSendNow?.(); }} onKeyDown={ignoreRepeat} style={sheetButton}>
                  <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}><SendNowIcon /></span>
                  <span style={{ flex: 1 }}>{t('compose.scheduleSend.edit.sendNow')}</span>
                </MaterialButton>
                <div aria-hidden="true" style={{ padding: '12px 20px 4px', fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)' }}>
                  {t('compose.scheduleSend.changeTime')}
                </div>
              </>
            )}
            {items.map((p, index) => (
              <MaterialButton variant="text" data-autofocus={index === 0 ? '' : undefined} key={p.id} type="button" data-preset={p.id} disabled={busy} onClick={() => choose(p.at)} onKeyDown={ignoreRepeat} style={sheetButton}>
                <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}>{clockIcon(16)}</span>
                <span style={{ flex: 1 }}>{t(PRESET_LABELS[p.id])}</span>
                <span style={{ fontSize: 14, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{formatSendAt(p.at, undefined, now)}</span>
              </MaterialButton>
            ))}
            <MaterialButton variant="text" type="button" data-preset="pick" disabled={busy} onClick={() => setPicking(true)} style={sheetButton}>
              <span style={{ flex: 1 }}>{t('compose.scheduleSend.pick')}</span>
            </MaterialButton>
            {actions && (
              <MaterialButton variant="text" type="button" data-preset="unschedule" disabled={busy} onClick={() => { onClose(); onUnschedule?.(); }} onKeyDown={ignoreRepeat} style={sheetButton}>
                <span style={{ flex: 1 }}>{t('compose.scheduleSend.edit.unschedule')}</span>
              </MaterialButton>
            )}
          </>
        )}
        <MaterialButton variant="text" type="button" onClick={onClose} style={{ ...sheetButton, borderBottom: 'none', color: 'var(--text-secondary)' }}>
          {t('common.cancel')}
        </MaterialButton>
      </div>
    </>
  );
}

// Under the composer's header while a scheduled message is edited: when it goes, and Change.
export function ScheduledStrip({ sendAt, onChange, mobile = false }) {
  const { t } = useTranslation();
  return (
    <div data-scheduled-strip="" style={{
      display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      padding: mobile ? '8px 16px' : '6px 14px', borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--accent-dim)', color: 'var(--text-primary)', fontSize: mobile ? 14 : 12,
    }}>
      <span style={{ color: 'var(--accent)', display: 'flex' }}>{clockIcon(mobile ? 16 : 13)}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{t('compose.scheduleSend.scheduledFor', { when: formatSendAt(sendAt) })}</span>
      <MaterialButton variant="text" type="button" onClick={onChange}
        style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 'inherit', fontWeight: 600, cursor: 'pointer', padding: mobile ? '10px 4px' : '2px 4px', minHeight: mobile ? 44 : undefined }}>
        {t('compose.scheduleSend.change')}
      </MaterialButton>
    </div>
  );
}

// A question scheduling has to ask, as the composer's other dialogs look: centered on desktop, a
// bottom sheet on phones. `actions` are { label, onClick, kind: 'primary' | 'danger' | 'plain',
// focus }; Escape and the backdrop are `onCancel`. Focus starts on the action marked `focus`, else
// the first, and Tab stays inside. A question that would send, send again or delete marks its
// safe way out, so an Enter meant for something else (or a held one) does not answer it yes; a
// held Enter's repeats are ignored on every action.
export function ComposeQuestion({ mobile = false, title, body, actions, onCancel }) {
  const titleId = useId();
  const bodyId = useId();
  const boxRef = useModalFocus({ onEscape: onCancel });
  useEffect(() => {
    const buttons = boxRef.current?.querySelectorAll('button') || [];
    (buttons[Math.max(0, actions.findIndex(a => a.focus))] || buttons[0])?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- focus once, when it opens
  const color = kind => kind === 'primary' ? (mobile ? 'var(--accent)' : 'var(--accent-text)') : kind === 'danger' ? 'var(--red)' : 'var(--text-secondary)';
  return (
    <>
      <div data-modal-scrim="" onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,0.4)' }} />
      <div
        ref={boxRef} className={mobile ? 'md-bottom-sheet' : 'md-dialog'} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={body ? bodyId : undefined}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); } else if (!swallowSendKey(e)) trapTab(e, boxRef.current);
        }}
        style={mobile ? {
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 2101, background: 'var(--bg-elevated)',
          borderRadius: '16px 16px 0 0', paddingBottom: 'calc((var(--sab) + 8px) / var(--ui-scale, 1))', boxShadow: 'var(--shadow-modal)',
          animation: 'sheet-enter var(--md-sys-motion-default-spatial) both',
        } : {
          position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 2101,
          background: 'var(--bg-elevated)', borderRadius: 12, boxShadow: 'var(--shadow-modal)',
          minWidth: 280, maxWidth: 400, padding: '20px 24px 16px',
        }}
      >
        <div id={titleId} style={mobile
          ? { padding: '16px 20px 4px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }
          : { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: body ? 8 : 16 }}>
          {title}
        </div>
        {body && (
          <div id={bodyId} style={mobile
            ? { padding: '6px 20px 12px', fontSize: 13, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }
            : { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.45 }}>
            {body}
          </div>
        )}
        <div style={mobile ? {} : { display: 'flex', flexDirection: 'column', gap: 8 }}>
          {actions.map(a => (
            <MaterialButton variant={mobile ? "menu" : a.kind === "primary" ? "filled" : "text"} data-autofocus={a.focus ? '' : undefined} key={a.label} type="button" onClick={a.onClick} disabled={a.disabled} onKeyDown={ignoreRepeat}
              style={mobile ? {
                width: '100%', minHeight: 52, padding: '16px 20px', textAlign: 'left', background: 'none', border: 'none',
                borderBottom: '1px solid var(--border-subtle)', color: color(a.kind), fontSize: 16, fontWeight: 500, cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              } : {
                padding: '8px 16px', borderRadius: 7, fontSize: 13, cursor: 'pointer', textAlign: 'center',
                background: a.kind === 'primary' ? 'var(--accent)' : 'none', color: color(a.kind),
                border: a.kind === 'primary' ? 'none' : a.kind === 'danger' ? '1px solid var(--border)' : 'none',
                fontWeight: a.kind === 'primary' ? 600 : 400,
              }}>
              {a.label}
            </MaterialButton>
          ))}
        </div>
      </div>
    </>
  );
}
