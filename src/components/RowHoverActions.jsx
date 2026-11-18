import { MaterialIcon } from '../material/controls.jsx';
import { MaterialButton } from '../material/controls.jsx';
import { StarIcon } from './MessageActions.jsx';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PluginSlot } from '../plugins/PluginSlot.jsx';

// Bottom-right hover quick-actions cluster shared by the flat MessageRow and the threaded
// ThreadRow and GTD sidebar rows. Presentational and closure-free: each action
// is a handler the caller passes as (e, message); a handler's absence hides its button (the
// same convention onMove already used, now generalized). `isRead` drives the mark-read
// icon/label polarity, and `background` + `deleteTitleKey` keep each call site's prior
// rendering byte-identical. `rowActionCtx`, when present (main-list rows only), renders the
// 'row-hover-action' plugin slot — a plugin can add its own leading hover button (GTD adds
// a "done" checkmark). Sidebar rows omit it.
//
// #440: `actions` picks WHICH buttons show, in canonical order. Callers that pass nothing
// (the GTD sidebar rows) keep the pre-#440 cluster exactly; the main list passes the
// user's configured set from Settings. A key whose handler the caller did not supply is
// skipped either way, so a set naming 'snooze' is inert on a surface with no snooze.

import { DEFAULT_HOVER_ACTIONS } from '../utils/hoverActions.js';
export { HOVER_ACTION_KEYS, DEFAULT_HOVER_ACTIONS } from '../utils/hoverActions.js';

export default function RowHoverActions({ message, isRead, background, deleteTitleKey = 'common.delete', onMarkRead, onStar, onArchive, onSnooze, onDelete, onMove, actions = DEFAULT_HOVER_ACTIONS, rowActionCtx }) {
  const { t } = useTranslation();

  const buttons = {
    markRead: onMarkRead && (
      <ActionBtn
        key="markRead"
        title={isRead ? t('contextMenu.markUnread') : t('contextMenu.markRead')}
        onClick={e => onMarkRead(e, message)}
      >
        {isRead ? (
          <MaterialIcon name="mark_email_unread" />
        ) : (
          <MaterialIcon name="drafts" />
        )}
      </ActionBtn>
    ),
    star: onStar && (
      <ActionBtn key="star" title={message.is_starred ? t('contextMenu.unstar') : t('contextMenu.star')} pressed={Boolean(message.is_starred)} onClick={e => onStar(e, message)}>
        <StarIcon filled={message.is_starred} />
      </ActionBtn>
    ),
    archive: onArchive && (
      <ActionBtn key="archive" title={t('shortcuts.actions.archive.label')} onClick={e => onArchive(e, message)}>
        <MaterialIcon name="archive" />
      </ActionBtn>
    ),
    snooze: onSnooze && (
      <ActionBtn key="snooze" title={t('contextMenu.snooze.label')} onClick={e => onSnooze(e, message)}>
        <MaterialIcon name="schedule" />
      </ActionBtn>
    ),
    delete: onDelete && (
      <ActionBtn key="delete" title={t(deleteTitleKey)} onClick={e => onDelete(e, message)}>
        <MaterialIcon name="delete" />
      </ActionBtn>
    ),
    move: onMove && (
      <ActionBtn key="move" title={t('contextMenu.moveToFolder')} onClick={e => onMove(e, message)}>
        <MaterialIcon name="folder" />
      </ActionBtn>
    ),
  };

  return (
    <div className="material-row-actions" style={{
      position: 'absolute', bottom: 4, right: 8, justifyContent: 'flex-end',
      display: 'flex', alignItems: 'center', gap: 2,
      background,
      borderRadius: 'var(--md-sys-shape-corner-small)',
      padding: '1px 2px',
    }}>
      {rowActionCtx && <PluginSlot name="row-hover-action" ctx={rowActionCtx} />}
      {actions.map(key => buttons[key] || null)}
    </div>
  );
}

export function ActionBtn({ children, onClick, title, pressed }) {
  const [hov, setHov] = useState(false);
  return (
    <MaterialButton variant="icon"
      onClick={onClick}
      title={title}
      aria-pressed={pressed}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? 'var(--bg-hover)' : 'none',
        border: 'none', padding: '3px', borderRadius: 'var(--md-sys-shape-corner-extra-small)',
        color: hov ? 'var(--text-secondary)' : 'var(--text-tertiary)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center',
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      {children}
    </MaterialButton>
  );
}
