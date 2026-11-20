import { MaterialButton, MaterialIcon } from '../material/controls.jsx';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/index.js';
import { isUndoAvailable } from '../utils/undoableAction.js';

// Kept off screen but readable, for the live regions.
const offScreen = {
  position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, border: 0,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
};
// How many recent notifications a live region keeps; older ones leave it unannounced.
const ANNOUNCED_KEPT = 3;

// What a screen reader hears of a notification: its title, and its body when that is text.
export const announcement = n => [n.title, typeof n.body === 'string' ? n.body : null]
  .filter(text => typeof text === 'string' && text.trim()).join('. ');

// Each new notification is said once (design 5.4): an error through role="alert", anything else
// through role="status". Both regions are in the page from the start, as live regions must be
// for what is added to them to be announced, and each notification is added as its own element,
// so the same words twice are said twice. The toasts, action bars and Undo bars are not live
// regions themselves, so nothing is read twice.
function Announcer({ notifications }) {
  const seenRef = useRef(new Set());
  const [said, setSaid] = useState({ status: [], alert: [] });
  useEffect(() => {
    const seen = seenRef.current;
    // Oldest first: the store keeps the newest at the front.
    const fresh = notifications.filter(n => !seen.has(n.id)).reverse();
    for (const id of [...seen]) if (!notifications.some(n => n.id === id)) seen.delete(id);
    if (!fresh.length) return;
    for (const n of fresh) seen.add(n.id);
    const add = (list, items) => [...list, ...items].slice(-ANNOUNCED_KEPT);
    const entry = n => ({ id: n.id, text: announcement(n) });
    setSaid(prev => ({
      status: add(prev.status, fresh.filter(n => n.type !== 'error').map(entry)),
      alert: add(prev.alert, fresh.filter(n => n.type === 'error').map(entry)),
    }));
  }, [notifications]);
  return (
    <>
      <div role="status" aria-live="polite" data-announce="status" style={offScreen}>
        {said.status.map(e => <div key={e.id}>{e.text}</div>)}
      </div>
      <div role="alert" aria-live="assertive" data-announce="alert" style={offScreen}>
        {said.alert.map(e => <div key={e.id}>{e.text}</div>)}
      </div>
    </>
  );
}

export default function NotificationToasts() {
  const { notifications, removeNotification, expireNotificationUndo } = useStore();
  const undo = notifications.find(isUndoAvailable);
  const notice = undo || notifications.findLast(n => !n.onUndo);

  useEffect(() => {
    const pending = notifications.filter(n => n.onUndo && Number.isFinite(n.undoExpiresAt));
    if (!pending.length) return;
    const expire = () => {
      for (const n of pending) {
        if (!isUndoAvailable(n)) expireNotificationUndo(n.id);
      }
    };
    // Queued notices share the operation's original deadline, even if they have never been shown.
    const timeout = setTimeout(expire, Math.max(0, Math.min(...pending.map(n => n.undoExpiresAt)) - Date.now()));
    return () => clearTimeout(timeout);
  }, [notifications, expireNotificationUndo]);

  return <>
    <Announcer notifications={notifications} />
    {notice && <Snackbar key={`${notice.id}:${Boolean(undo)}`} notice={notice} onDismiss={removeNotification} />}
  </>;
}

function Snackbar({ notice, onDismiss }) {
  const { t } = useTranslation();
  const [interacting, setInteracting] = useState(false);
  const panel = useRef(null);
  const returnFocus = useRef(null);
  const sticky = notice.persistent || notice.type === 'error';
  useEffect(() => {
    if (notice.onUndo || sticky || interacting) return;
    const timer = setTimeout(() => onDismiss(notice.id), notice.onAction ? 10000 : 5000);
    return () => clearTimeout(timer);
  }, [notice, onDismiss, sticky, interacting]);

  useLayoutEffect(() => {
    const element = panel.current;
    return () => {
      const target = returnFocus.current;
      if (!element?.contains(document.activeElement) || !target?.isConnected) return;
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) target.focus({ preventScroll: true });
      });
    };
  }, []);

  const runAction = () => {
    if (notice.onUndo && !isUndoAvailable(notice)) return;
    onDismiss(notice.id);
    void (notice.onUndo || notice.onAction)();
  };

  return <div ref={panel} className="material-snackbar"
    onFocusCapture={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) returnFocus.current = event.relatedTarget;
      setInteracting(true);
    }}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(event.currentTarget.matches(':hover'));
    }}
    onMouseEnter={() => setInteracting(true)}
    onMouseLeave={event => setInteracting(event.currentTarget.contains(document.activeElement))}
  >
    <div className="md-snackbar-copy">
      <div>{notice.title}</div>
      {notice.body && <div>{notice.body}</div>}
    </div>
    <MaterialButton variant="icon" className="md-snackbar-close" aria-label={t('common.dismiss')}
      onClick={() => onDismiss(notice.id)}>
      <MaterialIcon name="close" />
    </MaterialButton>
    {(notice.onUndo || notice.onAction) && <MaterialButton variant="text" className="md-snackbar-action" onClick={runAction}>
      {notice.onUndo ? t('common.undo') : notice.actionLabel || t('common.view')}
    </MaterialButton>}
  </div>;
}
