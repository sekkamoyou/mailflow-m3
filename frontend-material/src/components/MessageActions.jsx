import { MaterialIcon } from '../material/controls.jsx';
import { MaterialButton } from '../material/controls.jsx';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUiScale } from '../hooks/useUiScale.js';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/index.js';
import { useMobile } from '../hooks/useMobile.js';
import { getEffectiveShortcuts, parseModKey, modCompactLabel } from '../utils/defaultShortcuts.js';

// The action buttons of a message, shared by the single-message toolbar (MessagePane) and each
// message of a conversation (ConversationMessageCard), and the icon buttons of the conversation's
// own actions (ConversationPane). The conversation used to draw its own text buttons, and the two
// views drifted apart in look, order and what they offered (#650). Both now draw these.

export const ReplyIcon = () => <MaterialIcon name="reply" size={15} />;
export const ReplyAllIcon = () => <MaterialIcon name="reply_all" size={15} />;
export const ForwardIcon = () => <MaterialIcon name="forward" size={15} />;
export const ArchiveIcon = () => (
  <MaterialIcon name="archive" size={15} />
);
export const MoveIcon = () => <MaterialIcon name="folder" size={15} />;
export const SnoozeIcon = () => <MaterialIcon name="schedule" size={15} />;
export const SpamIcon = () => (
  <MaterialIcon name="report" size={15} />
);
export const HamIcon = () => (
  <MaterialIcon name="verified_user" size={15} />
);
export const TodoistIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21 0H3C1.35 0 0 1.35 0 3v3.858s3.854 2.24 4.098 2.38c.31.18.694.177 1.004 0 .26-.147 8.02-4.608 8.136-4.675.279-.161.58-.107.748-.01.164.097.606.348.84.48.232.134.221.502.013.622l-9.712 5.59c-.346.2-.69.204-1.048.002C3.478 10.907.998 9.463 0 8.882v2.02l4.098 2.38c.31.18.694.177 1.004 0 .26-.147 8.02-4.609 8.136-4.676.279-.16.58-.106.748-.008.164.096.606.347.84.48.232.133.221.5.013.62-.208.121-9.288 5.346-9.712 5.59-.346.2-.69.205-1.048.002C3.478 14.951.998 13.506 0 12.926v2.02l4.098 2.38c.31.18.694.177 1.004 0 .26-.147 8.02-4.609 8.136-4.676.279-.16.58-.106.748-.009.164.097.606.348.84.48.232.133.221.502.013.622l-9.712 5.59c-.346.199-.69.204-1.048.001C3.478 18.994.998 17.55 0 16.97V21c0 1.65 1.35 3 3 3h18c1.65 0 3-1.35 3-3V3c0-1.65-1.35-3-3-3z"/>
  </svg>
);
export const HeadersIcon = () => (
  <MaterialIcon name="subject" size={15} />
);
export const DownloadIcon = () => (
  <MaterialIcon name="download" size={15} />
);
export const PrintIcon = () => (
  <MaterialIcon name="print" size={15} />
);
export const AiIcon = () => (
  <MaterialIcon name="auto_awesome" size={15} />
);
// Reply with AI: the AI menu's sparkle, alone, so the two buttons side by side tell apart.
export const AiReplyIcon = () => (
  <MaterialIcon name="auto_awesome" size={15} />
);
export const MoreIcon = () => (
  <MaterialIcon name="more_horiz" size={15} />
);
export const ChevronIcon = ({ size = 11 }) => (
  <MaterialIcon name="expand_more" size={size} />
);
export const StarIcon = ({ filled }) => (
  <MaterialIcon name="star" size={15} style={{ color: filled ? 'var(--md-sys-color-primary)' : undefined, fontVariationSettings: filled ? '"FILL" 1' : '"FILL" 0' }} />
);
export const TrashIcon = () => (
  <MaterialIcon name="delete" size={15} />
);

// The action the read toggle offers: an envelope with an unread dot for "Mark as unread", an
// open envelope for "Mark as read". Same glyphs as the context menu.
export function ReadStateIcon({ isRead }) {
  return isRead ? (
    <MaterialIcon name="mark_email_unread" size={15} />
  ) : (
    <MaterialIcon name="drafts" size={15} />
  );
}

// A sun to go back to the original colors, a moon to show it dark.
export function DarkToggleIcon({ shownDark }) {
  return shownDark ? (
    <MaterialIcon name="light_mode" size={15} />
  ) : (
    <MaterialIcon name="dark_mode" size={15} />
  );
}

// A tooltip with the action's keyboard shortcut, as "Archive (E)". A phone has no keyboard to speak of,
// so there it is the label alone.
export function useShortcutTitle() {
  const shortcuts = useStore(s => s.shortcuts);
  const isMobile = useMobile();
  return (label, action) => {
    const key = getEffectiveShortcuts(shortcuts)[action];
    if (isMobile || !key) return label;
    const mod = parseModKey(key);
    return `${label} (${mod ? `${modCompactLabel(mod.mod)}${mod.bare.toUpperCase()}` : key.toUpperCase()})`;
  };
}

// On a phone every button is 44 px square, the touch target iOS and Android ask for, where the
// row has room. Where it has not (a narrow phone with a larger font size, which MailApp applies as
// a scale) the buttons of a row give way down to TOUCH_MIN, rather than push the last ones off
// screen: at 130% that is still about 42 px on the glass. A button inside a wrapper (Move, More,
// the reply split) gives way only if the wrapper does: its own automatic minimum would count the
// button's 44 px width, so a wrapper says its minimum outright (TOUCH_MIN, or the split's two).
// Their padding is narrow enough that the icon fits at the minimum.
export const TOUCH_TARGET = 44;
export const TOUCH_MIN = 32;
const touchSize = {
  width: TOUCH_TARGET, minWidth: TOUCH_MIN, minHeight: TOUCH_TARGET, flexShrink: 1, padding: '6px 4px', boxSizing: 'border-box',
};

// An icon button. `label` is its accessible name, `title` its tooltip, which may add the keyboard
// shortcut. `disabled` is aria-disabled with the click ignored, not the native attribute, so the
// title still shows on hover: it is what explains why.
export function ActionBtn({
  children, onClick, label, title, danger, style: extraStyle, pressed, disabled = false, touch = false,
  popup = false, expanded, btnRef, className = '', selected,
}) {
  const [hov, setHov] = useState(false);
  return (
    <MaterialButton variant="icon"
      selected={selected}
      ref={btnRef}
      type="button"
      onClick={disabled ? undefined : onClick}
      title={title ?? label}
      aria-label={label}
      aria-pressed={pressed}
      aria-haspopup={popup ? 'menu' : undefined}
      aria-expanded={popup ? Boolean(expanded) : undefined}
      aria-disabled={disabled || undefined}
      className={`btn-press ${className}`}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? (danger ? 'rgba(248,113,113,0.1)' : 'var(--bg-tertiary)') : 'transparent',
        border: '1px solid ' + (hov ? (danger ? 'rgba(248,113,113,0.3)' : 'var(--border)') : 'transparent'),
        borderRadius: 6, padding: '6px 8px',
        color: danger ? (hov ? 'var(--red)' : 'var(--text-tertiary)') : 'var(--text-secondary)',
        cursor: disabled ? 'default' : 'pointer', fontSize: 13,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        transition: 'all 0.1s',
        opacity: disabled ? 0.45 : 1,
        ...(touch ? touchSize : {}),
        ...extraStyle,
      }}
    >
      {children}
    </MaterialButton>
  );
}

// A menu opened from a button, with the keyboard contract of role="menu": focus moves to the first
// item on open; Arrow Up and Down move between the items, wrapping, and Home and End go to the ends;
// Escape, a click outside or picking an item closes it and puts focus back on the button; Tab
// closes it and lets focus move on. `children(choose)`: choose(run) closes, refocuses, then runs.
function MenuPopup({ triggerRef, onClose, align = 'start', minWidth = 150, children }) {
  const menuRef = useRef(null);
  const items = () => [...(menuRef.current?.querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"]') || [])];
  const scale = useUiScale();
  const isMobile = useMobile();
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const bounds = menu.parentElement.getBoundingClientRect();
    const trigger = triggerRef.current.getBoundingClientRect();
    const maxWidth = Math.min(280, bounds.width / scale);
    menu.style.minWidth = `${Math.min(minWidth, maxWidth)}px`;
    menu.style.maxWidth = `${maxWidth}px`;
    const width = menu.offsetWidth;
    const left = (align === 'end' ? trigger.right - width * scale : trigger.left) - bounds.left;
    const below = Math.min(bounds.bottom, Math.max(bounds.top, trigger.bottom + 4 * scale));
    const above = Math.max(bounds.top, Math.min(bounds.bottom, trigger.top - 4 * scale));
    const belowSpace = bounds.bottom - below;
    const aboveSpace = above - bounds.top;
    // Keep enough of the message in view while a long menu scrolls on a phone.
    const heightLimit = isMobile ? bounds.height / 2 : bounds.height;
    const desiredHeight = Math.min(menu.scrollHeight * scale, heightLimit);
    const opensBelow = desiredHeight <= belowSpace || (desiredHeight > aboveSpace && belowSpace >= aboveSpace);
    Object.assign(menu.style, {
      width: `${width}px`,
      left: `${Math.max(0, Math.min(left, bounds.width - width * scale))}px`,
      top: opensBelow ? `${below - bounds.top}px` : 'auto',
      bottom: opensBelow ? 'auto' : `${bounds.bottom - above}px`,
      transformOrigin: opensBelow ? 'top left' : 'bottom left',
      maxHeight: `${Math.min(heightLimit, opensBelow ? belowSpace : aboveSpace) / scale}px`,
    });
    items()[0]?.focus({ preventScroll: true });
  }, [triggerRef, align, minWidth, scale, isMobile]);
  useEffect(() => {
    const doc = triggerRef.current.ownerDocument;
    const closeOnMove = event => { if (!menuRef.current?.contains(event.target)) onClose(); };
    doc.addEventListener('scroll', closeOnMove, true);
    doc.defaultView.addEventListener('resize', closeOnMove);
    return () => {
      doc.removeEventListener('scroll', closeOnMove, true);
      doc.defaultView.removeEventListener('resize', closeOnMove);
    };
  }, [triggerRef, onClose]);
  const close = (refocus = true) => {
    onClose();
    if (refocus) triggerRef.current?.focus();
  };
  const choose = run => {
    close();
    run();
  };
  const onKeyDown = e => {
    const list = items();
    const at = list.indexOf(document.activeElement);
    const go = i => { e.preventDefault(); list[(i + list.length) % list.length]?.focus(); };
    switch (e.key) {
      case 'ArrowDown': go(at + 1); break;
      case 'ArrowUp': go(at < 0 ? list.length - 1 : at - 1); break;
      case 'Home': go(0); break;
      case 'End': go(list.length - 1); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break;
      case 'Tab': close(); break;
      default: break;
    }
  };
  return createPortal(<>
    <div className="md-menu-backdrop" onClick={() => close()} aria-hidden />
    <div className="md-menu-viewport">
      <div ref={menuRef} role="menu" aria-label={triggerRef.current.getAttribute('aria-label')} className="md-menu-popup" onKeyDown={onKeyDown}
        style={{ transform: `scale(${scale})` }}>
        {children(choose)}
      </div>
    </div>
  </>, triggerRef.current.ownerDocument.body);
}

const menuItemStyle = (extra = {}) => ({
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
  padding: '11px 14px', background: 'transparent', border: 'none', cursor: 'pointer',
  fontSize: 13, color: 'var(--text-primary)', font: 'inherit', ...extra,
});

// Reply, split: the button replies the way the reader's setting says, the arrow offers the other.
export function ReplySplitButton({ defaultReplyAll, onReply, title, touch = false }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const label = defaultReplyAll ? t('message.replyAll') : t('message.reply');
  const other = defaultReplyAll
    ? { label: t('message.reply'), replyAll: false }
    : { label: t('message.replyAll'), replyAll: true };
  return (
    <div className="md-reply-actions md-split-button">
      <ActionBtn onClick={() => { setOpen(false); onReply(defaultReplyAll); }} label={label} title={title ?? label} touch={touch}>
        {defaultReplyAll ? <ReplyAllIcon /> : <ReplyIcon />}
      </ActionBtn>
      <ActionBtn btnRef={triggerRef} onClick={() => setOpen(v => !v)} label={t('message.replyOptions')}
        popup expanded={open} touch={touch}>
        <ChevronIcon />
      </ActionBtn>
      {open && (
        <MenuPopup
          triggerRef={triggerRef}
          onClose={() => setOpen(false)}

        >
          {choose => (
            <MaterialButton variant="menu"
              type="button"
              role="menuitem"
              onClick={() => choose(() => onReply(other.replyAll))}
              style={menuItemStyle({ padding: '9px 14px', minHeight: touch ? TOUCH_TARGET : undefined })}
              
            >
              {other.label}
            </MaterialButton>
          )}
        </MenuPopup>
      )}
    </div>
  );
}

// The AI actions dropdown: the built-in summary, the reader's own actions, and a way to manage them.
function AiMenuButton({ ai, touch }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const item = (choose, key, label, run, muted = false) => (
    <MaterialButton variant="menu"
      key={key}
      type="button"
      role="menuitem"
      onClick={() => choose(run)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%',
        padding: '8px 10px', cursor: 'pointer', fontSize: 13, borderRadius: 6, border: 'none',
        background: 'transparent', font: 'inherit', textAlign: 'left',
        color: muted ? 'var(--text-secondary)' : 'var(--text-primary)',
        minHeight: touch ? TOUCH_TARGET : undefined,
      }}
      
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {ai.results?.[key]?.status === 'done' && <span aria-hidden="true" style={{ fontSize: 9, color: 'var(--accent)', flexShrink: 0 }}>●</span>}
    </MaterialButton>
  );
  return (
    <div style={{ position: 'relative' }}>
      <ActionBtn btnRef={triggerRef} onClick={() => setOpen(v => !v)} label={t('message.aiActions')} touch={touch} popup expanded={open}
        className="md-ai-menu-trigger" selected={open}
        style={Object.keys(ai.results || {}).length ? { color: 'var(--accent)' } : {}}>
        <AiIcon />
        <ChevronIcon />
      </ActionBtn>
      {open && (
        <MenuPopup
          triggerRef={triggerRef}
          onClose={() => setOpen(false)}
          align="end" minWidth={220}
        >
          {choose => <>
            {ai.items.map(a => item(choose, a.id, a.label, () => ai.onRun(a)))}
            {ai.onManage && <>
              <div role="separator" style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
              {item(choose, '__manage', t('message.manageAiActions'), ai.onManage, true)}
            </>}
          </>}
        </MenuPopup>
      )}
    </div>
  );
}

// The phone More menu's order, the reading pane's since before the views shared these buttons: the
// read toggle first, as the action reached for most. Reply with AI is a toolbar button on a desktop.
export const MORE_MENU_ORDER = ['read', 'aiReply', 'forward', 'move', 'star', 'spam', 'ham', 'todoist', 'headers', 'print', 'dark', 'eml', 'delete'];

// One Material icon button, including its inline margins.
const MOBILE_ACTION_SLOT = 48;

// On a phone, mobileToolbarItems fill the space left after the fixed controls and More button.
// The rest join the usual More actions and keep their existing menu order.
export function MessageTools({ isMobile, items, ai = null, mobileToolbarItems = [] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [toolbarCount, setToolbarCount] = useState(0);
  const triggerRef = useRef(null);
  const toolbarSpace = useRef(null);
  const itemCount = mobileToolbarItems.length;
  useLayoutEffect(() => {
    const space = toolbarSpace.current;
    if (!isMobile || !space) return;
    const measure = width => setToolbarCount(Math.min(itemCount, Math.floor(width / MOBILE_ACTION_SLOT)));
    measure(space.clientWidth);
    const observer = new space.ownerDocument.defaultView.ResizeObserver(([entry]) => measure(entry.contentRect.width));
    observer.observe(space);
    return () => observer.disconnect();
  }, [isMobile, itemCount]);
  if (!isMobile) {
    return (
      <>
        {items.map(item => (
          <ActionBtn key={item.key} onClick={item.onClick} label={item.label} title={item.title}
            pressed={item.pressed} disabled={item.disabled}>
            {item.icon}
          </ActionBtn>
        ))}
        {ai && <AiMenuButton ai={ai} />}
      </>
    );
  }
  const rank = key => (MORE_MENU_ORDER.includes(key) ? MORE_MENU_ORDER.indexOf(key) : MORE_MENU_ORDER.length);
  const menuItems = [...items, ...mobileToolbarItems.slice(toolbarCount)].sort((a, b) => rank(a.key) - rank(b.key));
  const aiItems = ai ? ai.items : [];
  const all = [
    ...menuItems.map(item => ({
      ...item, run: item.onClick,
    })),
    ...aiItems.map(a => ({ key: `ai-${a.id}`, label: a.label, icon: <AiIcon />, run: () => ai.onRun(a) })),
  ];
  const more = (
    <div style={{ position: 'relative', display: 'flex', minWidth: TOUCH_MIN, flexShrink: itemCount ? 0 : undefined }}>
      <ActionBtn btnRef={triggerRef} onClick={() => setOpen(v => !v)} label={t('message.more')} touch popup expanded={open}>
        <MoreIcon />
      </ActionBtn>
      {open && (
        <MenuPopup
          triggerRef={triggerRef}
          onClose={() => setOpen(false)}
          align="end" minWidth={190}
        >
          {choose => all.map((item, i) => (
            <MaterialButton variant="menu"
              key={item.key}
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={item.checked}
              data-danger={item.danger || undefined}
              aria-disabled={item.disabled || undefined}
              onClick={() => choose(() => { if (!item.disabled) item.run(); })}
              style={menuItemStyle({
                minHeight: TOUCH_TARGET,
                cursor: item.disabled ? 'default' : 'pointer',
                opacity: item.disabled ? 0.55 : 1,
                borderBottom: i < all.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              })}
              
            >
              {item.icon}
              {item.label}
            </MaterialButton>
          ))}
        </MenuPopup>
      )}
    </div>
  );
  return itemCount ? (
    <div className="md-mobile-message-tools">
      <div className="md-mobile-message-shortcuts" ref={toolbarSpace}>
        {mobileToolbarItems.slice(0, toolbarCount).map(item => (
          <ActionBtn key={item.key} label={item.label} title={item.title} onClick={item.onClick}
            touch danger={item.danger} pressed={item.checked}>
            {item.icon}
          </ActionBtn>
        ))}
      </div>
      {more}
    </div>
  ) : more;
}

const noticeStyle = accent => ({
  marginBottom: 10, padding: '9px 14px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderLeft: `3px solid ${accent}`,
  borderRadius: 8,
  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
  fontSize: 12, color: 'var(--text-secondary)',
});

// Remote images were blocked: load them for this message, or always for the sender or its domain.
export function RemoteImagesNotice({ fromEmail, onLoad, onAllowSender, onAllowDomain, saving = false }) {
  const { t } = useTranslation();
  const domain = fromEmail?.includes('@') ? fromEmail.split('@')[1] : '';
  return (
    <div className="msg-notice" style={noticeStyle('var(--accent)')}>
      <MaterialIcon name="verified_user" size={15} />
      <span>{t('message.remoteImagesBlocked')}</span>
      <div className="material-notice-actions" style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
        {[
          { label: t('message.loadImages'), handler: onLoad, disabled: false },
          fromEmail && { label: t('message.allowSender', { email: fromEmail }), handler: onAllowSender, disabled: saving },
          domain && { label: t('message.allowDomain', { domain }), handler: onAllowDomain, disabled: saving },
        ].filter(Boolean).map(({ label, handler, disabled }) => (
          <MaterialButton variant="outlined" key={label} type="button" onClick={handler} disabled={disabled}
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 5, padding: '3px 9px', cursor: disabled ? 'default' : 'pointer',
              color: 'var(--accent)', fontSize: 11, fontWeight: 500,
              opacity: disabled ? 0.5 : 1,
            }}
            
            
          >{label}</MaterialButton>
        ))}
      </div>
    </div>
  );
}

// A newsletter with a List-Unsubscribe header. status: null | 'loading' | 'error'.
export function UnsubscribeNotice({ status, onUnsubscribe }) {
  const { t } = useTranslation();
  return (
    <div className="msg-notice" style={noticeStyle('var(--text-tertiary)')}>
      <span style={{ flex: 1 }}>{t('message.unsubscribe.info')}</span>
      <MaterialButton variant="outlined"
        type="button"
        onClick={onUnsubscribe}
        disabled={status === 'loading'}
        style={{
          background: 'none', border: '1px solid var(--border)',
          borderRadius: 5, padding: '3px 9px',
          cursor: status === 'loading' ? 'default' : 'pointer',
          color: status === 'error' ? 'var(--red, #e53e3e)' : 'var(--text-primary)',
          fontSize: 11, fontWeight: 500,
          opacity: status === 'loading' ? 0.5 : 1,
        }}
      >
        {status === 'loading' ? t('common.loading') :
         status === 'error' ? t('message.unsubscribe.error') :
         t('message.unsubscribe.button')}
      </MaterialButton>
    </div>
  );
}
