import { MaterialIcon } from '../material/controls.jsx';
import { MaterialButton } from '../material/controls.jsx';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UNDO_WINDOW_MS } from '../utils/undoableAction.js';

// The undo bar anchored to the bottom of a list on desktop: the message list's, and the
// Scheduled view's. On phones NotificationToasts shows the same notification as an action bar.
// It is not a live region: NotificationToasts says every notification to screen readers once.
export default function UndoBar({ notification, onDismiss, showTopBorder }) {
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
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
        borderTop: showTopBorder ? '1px solid var(--border-subtle)' : 'none',
        padding: '9px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--bg-primary)',
      }}
    >
      <div style={{
        position: 'absolute', bottom: 0, left: 0,
        height: 2, background: 'var(--accent)',
        animation: `action-bar-progress ${windowMs}ms linear forwards`,
      }} />
      <span className="md-snackbar-title" style={{
        flex: 1, minWidth: 0,
        fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--text-secondary)',
        overflowWrap: 'anywhere',
      }}>
        {notification.title}
      </span>
      <div className="md-snackbar-actions">
      {notification.onAction && (
        <MaterialButton variant="text"
          onClick={() => { notification.onAction(); dismiss(); }}
          style={{
            background: 'none', border: 'none',
            color: 'var(--text-secondary)', fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 600,
            cursor: 'pointer', padding: '2px 4px', flexShrink: 0,
          }}
        >
          {notification.actionLabel || t('common.view')}
        </MaterialButton>
      )}
      <MaterialButton variant="text"
        onClick={handleUndo}
        style={{
          background: 'none', border: 'none',
          color: 'var(--accent)', fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 600,
          cursor: 'pointer', padding: '2px 4px', flexShrink: 0,
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
          color: 'var(--text-tertiary)', cursor: 'pointer',
          padding: 2, display: 'flex', flexShrink: 0,
          transition: 'color 0.15s',
        }}
        
        
      >
        <MaterialIcon name="close" />
      </MaterialButton>
    </div>
  );
}
