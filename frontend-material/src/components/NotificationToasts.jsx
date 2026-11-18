import { MaterialIcon } from '../material/controls.jsx';
import { MaterialButton } from '../material/controls.jsx';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/index.js';
import { useMobile } from '../hooks/useMobile.js';
import { descaleCss } from '../utils/uiScaleCss.js';
import { UNDO_WINDOW_MS } from '../utils/undoableAction.js';

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
// regions themselves, so nothing is read twice, and an Undo bar a list draws is heard too.
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
  const { notifications, removeNotification } = useStore();
  const isMobile = useMobile();

  const undoable = notifications.filter(n => n.onUndo);
  const regular  = notifications.filter(n => !n.onUndo);

  return (
    <>
      <Announcer notifications={notifications} />
      {isMobile ? (
        <div className="md-toast-stack" style={{
          position: 'fixed',
          bottom: 'calc(var(--sab) + 20px)',
          left: 16,
          right: 16,
          display: 'flex', flexDirection: 'column-reverse', gap: 8,
          zIndex: 3000, pointerEvents: 'none',
        }}>
          {/* Action bars render first → appear at bottom (thumb-reachable) */}
          {undoable.map(n => (
            <ActionBar key={n.id} notification={n} onDismiss={() => removeNotification(n.id)} isMobile />
          ))}
          {regular.map(n => (
            <Toast key={n.id} notification={n} onDismiss={() => removeNotification(n.id)} isMobile />
          ))}
        </div>
      ) : (
        <div className="md-toast-stack" style={{
          position: 'fixed',
          bottom: 24, right: 24, width: 380, maxWidth: descaleCss('100vw - 48px'),
          display: 'flex', flexDirection: 'column-reverse', gap: 8,
          zIndex: 3000, pointerEvents: 'none',
          alignItems: 'flex-end',
        }}>
          {regular.map(n => (
            <Toast key={n.id} notification={n} onDismiss={() => removeNotification(n.id)} isMobile={false} />
          ))}
        </div>
      )}
    </>
  );
}

function ActionBar({ notification, onDismiss, isMobile }) {
  const { t } = useTranslation();
  const [exiting, setExiting] = useState(false);

  const dismiss = () => {
    setExiting(true);
    setTimeout(onDismiss, 190);
  };

  const handleUndo = () => {
    notification.onUndo();
    dismiss();
  };

  // Undo send brings its own window; everything else uses the standard one.
  const windowMs = notification.undoMs ?? UNDO_WINDOW_MS;
  useEffect(() => {
    const timer = setTimeout(dismiss, windowMs);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={`material-snackbar md-action-snackbar ${exiting ? 'action-bar-exit' : 'action-bar-enter'}`}
      style={{
        position: 'relative',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--md-sys-shape-corner-medium)',
        padding: '10px 8px 10px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
        width: isMobile ? '100%' : undefined,
        maxWidth: isMobile ? undefined : 360,
        boxShadow: 'var(--shadow-soft)',
        pointerEvents: 'all',
        overflow: 'hidden',
      }}
    >
      {/* Progress bar — empties over the undo window */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0,
        height: 2,
        background: 'var(--accent)',
        animation: `action-bar-progress ${windowMs}ms linear forwards`,
      }} />

      <span className="md-snackbar-title" style={{
        flex: 1, minWidth: 0,
        fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 500,
        color: 'var(--text-primary)',
        overflowWrap: 'anywhere',
      }}>
        {notification.title}
      </span>

      <div className="md-snackbar-actions">
      {notification.onAction && (
        <MaterialButton variant="text"
          onClick={() => { notification.onAction(); dismiss(); }}
          style={{
            background: 'none', border: 'none', color: 'var(--text-secondary)',
            fontSize: 'var(--md-sys-typescale-body-small-size)', fontWeight: 600, padding: '4px 8px', cursor: 'pointer', flexShrink: 0,
          }}
        >
          {notification.actionLabel || t('common.view')}
        </MaterialButton>
      )}

      <MaterialButton variant="tonal"
        onClick={handleUndo}
        style={{
          background: 'var(--accent-dim)',
          border: '1px solid rgba(124,106,247,0.3)',
          borderRadius: 'var(--md-sys-shape-corner-small)',
          color: 'var(--accent)',
          fontSize: 'var(--md-sys-typescale-body-small-size)', fontWeight: 600,
          padding: '4px 12px',
          cursor: 'pointer', flexShrink: 0,
          transition: 'background 0.12s',
        }}
        
        
      >
        {t('common.undo')}
      </MaterialButton>

      </div>
      <MaterialButton variant="icon" className="md-snackbar-close"
        onClick={dismiss}
        aria-label={t('common.dismiss')}
        style={{
          background: 'none', border: 'none',
          color: 'var(--text-tertiary)',
          cursor: 'pointer', padding: '4px 6px',
          display: 'flex', flexShrink: 0,
          transition: 'color 0.15s',
        }}
        
        
      >
        <MaterialIcon name="close" />
      </MaterialButton>
    </div>
  );
}

function Toast({ notification, onDismiss, isMobile }) {
  const { t } = useTranslation();
  const [exiting, setExiting] = useState(false);

  const dismiss = () => {
    setExiting(true);
    setTimeout(onDismiss, 190);
  };

  useEffect(() => {
    if (notification.persistent) return undefined;

    const duration = notification.onUndo ? (notification.undoMs ?? UNDO_WINDOW_MS) : 5000;
    const timer = setTimeout(dismiss, duration);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUndo = () => {
    notification.onUndo();
    dismiss();
  };

  const enterClass = isMobile ? 'toast-enter-mobile' : 'toast-enter';
  const exitClass  = isMobile ? 'toast-exit-mobile'  : 'toast-exit';

  return (
    <div
      className={`material-snackbar md-toast ${exiting ? exitClass : enterClass}`}
      style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 'var(--md-sys-shape-corner-medium)', padding: '12px 14px',
        display: 'flex', alignItems: 'flex-start', gap: 10,
        width: notification.allowWrap && !isMobile ? 380 : undefined,
        maxWidth: notification.allowWrap && !isMobile ? 'calc(100vw - 48px)' : isMobile ? '100%' : 340,
        boxShadow: 'var(--shadow-popover)',
        pointerEvents: 'all',
      }}
    >
      <div className="md-toast-icon" aria-hidden="true" style={{
        width: 32, height: 32, borderRadius: 'var(--md-sys-shape-corner-small)', flexShrink: 0,
        background: notification.type === 'error' ? 'rgba(248,113,113,0.15)' : 'var(--accent-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: notification.type === 'error' ? 'var(--red)' : 'var(--accent)',
      }}>
        {notification.type === 'error' ? (
          <MaterialIcon name="error" />
        ) : (
          <MaterialIcon name="mail" />
        )}
      </div>
      <div className="md-toast-copy" style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 500, color: 'var(--text-primary)', marginBottom: notification.body ? 2 : 0 }}>
          {notification.title}
        </div>
        {notification.body != null && <div style={{
          fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)',
          overflow: notification.allowWrap ? 'visible' : 'hidden',
          textOverflow: notification.allowWrap ? 'clip' : 'ellipsis',
          whiteSpace: notification.allowWrap ? 'pre-wrap' : 'nowrap',
          lineHeight: notification.allowWrap ? 1.35 : undefined,
          overflowWrap: notification.allowWrap ? 'anywhere' : undefined,
        }}>
          {notification.body}
        </div>}
      </div>
      <div className="md-snackbar-actions">
      {notification.onAction && (
        <MaterialButton variant="outlined"
          onClick={() => { notification.onAction(); dismiss(); }}
          style={{
            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
            borderRadius: 'var(--md-sys-shape-corner-small)', color: 'var(--text-secondary)', fontSize: 'var(--md-sys-typescale-body-small-size)', fontWeight: 600,
            padding: '3px 10px', cursor: 'pointer', flexShrink: 0,
            transition: 'background 0.12s',
          }}
          
          
        >
          {notification.actionLabel || t('common.view')}
        </MaterialButton>
      )}
      {notification.onUndo && (
        <MaterialButton variant="tonal"
          onClick={handleUndo}
          style={{
            background: 'var(--accent-dim)', border: '1px solid rgba(124,106,247,0.3)',
            borderRadius: 'var(--md-sys-shape-corner-small)', color: 'var(--accent)', fontSize: 'var(--md-sys-typescale-body-small-size)', fontWeight: 600,
            padding: '3px 10px', cursor: 'pointer', flexShrink: 0,
            transition: 'background 0.12s',
          }}
          
          
        >
          {t('common.undo')}
        </MaterialButton>
      )}
      </div>
      <MaterialButton variant="icon" className="md-snackbar-close"
        onClick={dismiss}
        aria-label={t('common.dismiss')}
        style={{
          background: 'none', border: 'none', color: 'var(--text-tertiary)',
          cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0,
          transition: 'color 0.15s',
        }}
        
        
      >
        <MaterialIcon name="close" />
      </MaterialButton>
    </div>
  );
}
