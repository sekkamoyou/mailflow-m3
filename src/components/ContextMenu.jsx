import { spamFolderPaths as spamFolderPathsFor } from '../utils/spamFolders.js';
import { descaleCss } from '../utils/uiScaleCss.js';
import DateTimeInput from '../material/DateTimeInput.jsx';
import { MaterialInput, MaterialButton, MaterialIcon } from '../material/controls.jsx';
import { Fragment, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { copyToClipboard } from '../utils/clipboard.js';
import { useStore } from '../store/index.js';
import { api } from '../utils/api.js';
import { getContextMenuPolicy, resolveContextMenuMessage } from '../utils/contextMenuPolicy.js';
import { downloadEml } from '../utils/downloadEml.js';
import { isSnoozed } from '../utils/snoozeActions.js';
import { SNOOZE_DEFAULT_TIME, snoozeCustomUntil, snoozeDefaultDate, snoozeMinDate } from '../utils/snoozeTimes.js';
import { usePluginCollected } from '../plugins/PluginSlot.jsx';
import MessageHeaderModal from './MessageHeaderModal.jsx';
import FolderPathLabel from './FolderPathLabel.jsx';
import { buildMovePickerSections, movePickerSectionHeading, movePickerFoldersEmpty, runMovePickerAction } from '../utils/folderDisplay.js';
import { useUiScale } from '../hooks/useUiScale.js';
import { useMobile } from '../hooks/useMobile.js';

// ─── Context Menu ─────────────────────────────────────────────────────────────
const CATEGORIES = ['primary', 'newsletter', 'promotion', 'automated', 'social'];

export default function ContextMenu({ x, y, message, onClose, onAction, defaultMoveView = false, defaultSnoozeView = false, variant = 'inbox', selectedText = '' }) {
  const { t } = useTranslation();
  const uiScale = useUiScale();
  const isMobile = useMobile();
  // Variants share one menu; the policy removes actions that depend on the center
  // list or conflict with GTD's Done contract while preserving ordinary mail actions.
  const menuPolicy = getContextMenuPolicy(variant);
  const recentFolders = useStore(s => s.recentFolders);
  const favoriteFolders = useStore(s => s.favoriteFolders);
  // Pull the current account so we can render the spam/ham visibility based on
  // folder_mappings.spam + special_use heuristics instead of a fragile name match.
  const account = useStore(s => s.accounts.find(a => a.id === message.account_id));
  const accountFolders = useStore(s => s.folders[message.account_id] || []);
  const categorizationEnabled = useStore(s => s.categorizationEnabled);
  const categorizationActive = categorizationEnabled || !!account?.categorization_enabled;
  const menuRef = useRef(null);
  const menuOpenerRef = useRef(null);
  const [headerMessage, setHeaderMessage] = useState(null);
  // A plugin submenu (render fn) takes over the menu content area, like categorizeView/moveView.
  // Set via the openSubmenu capability handed to context-menu-item contributions; null = item list.
  const [pluginSubmenu, setPluginSubmenu] = useState(null);
  const [moveView, setMoveView] = useState(defaultMoveView);
  const [moveFolders, setMoveFolders] = useState(null);
  const [moveFoldersLoading, setMoveFoldersLoading] = useState(defaultMoveView);
  const [snoozeView, setSnoozeView] = useState(defaultSnoozeView);
  // The snooze picker snoozes, or for a message already snoozed changes when it comes back (#269).
  const snoozeAction = isSnoozed(message) ? 'changeSnooze' : 'snooze';
  const [customSnoozeView, setCustomSnoozeView] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState(SNOOZE_DEFAULT_TIME);
  // false, or which category list is open: 'message' (this message), 'sender' or 'domain' (#490).
  const [categorizeView, setCategorizeView] = useState(false);
  const [folderSearch, setFolderSearch] = useState('');
  const unreadCount = Number.parseInt(message.unread_count, 10);
  const hasUnread = Number.isFinite(unreadCount) ? unreadCount > 0 : !message.is_read;
  const isMessagePane = variant === 'messagePane';
  const hasSelectedText = Boolean(String(selectedText || '').trim());

  // A folder is "spam-like" when either the user mapped it as spam or the IMAP
  // server tagged it with \Junk special-use. Falls back to a multilingual name
  // heuristic so unconfigured accounts still get sensible context-menu items.
  // Mirrors resolveAllSpamPaths on the backend so server and client agree.
  const spamFolderPaths = spamFolderPathsFor(account, accountFolders);
  const inSpamFolder = spamFolderPaths.has(message.folder);

  // Adjust position to stay within viewport. The menu's height changes after
  // mount (folders load async, subviews like Move/Snooze swap in), so re-clamp
  // on every size change — measuring only at open time lets a menu that grows
  // near the bottom edge overflow off-screen.
  const [pos, setPos] = useState({ x, y });
  const [menuScale, setMenuScale] = useState(uiScale);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    // Mobile renders a fixed, vertically-centered slide-out panel (see the
    // container style below), so the tap-point clamp is desktop-only.
    const scale = menu.closest('[data-ui-scale-root]') ? uiScale : 1;
    setMenuScale(scale);
    if (isMobile) return;
    const clamp = () => {
      const rect = { width: menu.offsetWidth * scale, height: menu.offsetHeight * scale };
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const vars = getComputedStyle(document.documentElement);
      const top = (parseFloat(vars.getPropertyValue('--sat')) || 0) + 8;
      const bottom = vh - (parseFloat(vars.getPropertyValue('--sab')) || 0) - 8;
      const nx = Math.max(8, Math.min(x + rect.width > vw ? x - rect.width : x, vw - rect.width - 8)) / scale;
      const ny = Math.max(top, Math.min(y + rect.height > bottom ? y - rect.height : y, bottom - rect.height)) / scale;
      setPos(prev => (prev.x === nx && prev.y === ny ? prev : { x: nx, y: ny }));
    };
    clamp();
    const observer = new ResizeObserver(clamp);
    observer.observe(menu);
    window.addEventListener('resize', clamp);
    return () => { observer.disconnect(); window.removeEventListener('resize', clamp); };
  }, [x, y, isMobile, uiScale]);

  // Auto-load folders when opened directly in move mode (e.g. from row folder icon)
  useEffect(() => {
    if (!defaultMoveView) return;
    api.getFolders(message.account_id)
      .then(data => setMoveFolders(Array.isArray(data) ? data : (data.folders || [])))
      .catch(() => setMoveFolders([]))
      .finally(() => setMoveFoldersLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMoveClick = async () => {
    setMoveView(true);
    if (moveFolders) return; // already loaded
    setMoveFoldersLoading(true);
    try {
      const data = await api.getFolders(message.account_id);
      setMoveFolders(Array.isArray(data) ? data : (data.folders || []));
    } catch {
      setMoveFolders([]);
    } finally {
      setMoveFoldersLoading(false);
    }
  };

  // Return focus to the source control when the entire menu closes.
  useEffect(() => {
    menuOpenerRef.current = document.activeElement;
    return () => {
      const opener = menuOpenerRef.current;
      if (opener?.isConnected) opener.focus?.({ preventScroll: true });
    };
  }, []);

  // The scrim handles outside clicks, including taps inside the email iframe. Keyboard
  // navigation stays in the document so it works from every rendered submenu.
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return undefined;
    const focusItems = () => [...menu.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])')];
    const focusItem = index => {
      const entries = focusItems();
      if (!entries.length) return;
      entries.forEach((entry, i) => { entry.tabIndex = i === index ? 0 : -1; });
      entries[index]?.focus({ preventScroll: true });
      entries[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    const entries = focusItems();
    const activeIndex = entries.indexOf(document.activeElement.closest?.('[role="menuitem"]'));
    entries.forEach((entry, i) => { entry.tabIndex = i === (activeIndex < 0 ? 0 : activeIndex) ? 0 : -1; });
    if (!menu.contains(document.activeElement)) focusItem(0);
    const handleKey = event => {
      if (event.defaultPrevented || event.target.closest('[aria-modal="true"]')) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (!menu.contains(event.target) || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const entries = focusItems();
      if (!entries.length) return;
      const current = entries.indexOf(event.target.closest('[role="menuitem"]'));
      let next = null;
      if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % entries.length;
      else if (event.key === 'ArrowUp') next = current < 0 ? entries.length - 1 : (current - 1 + entries.length) % entries.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = entries.length - 1;
      else if (event.key === 'ArrowRight' && current >= 0 && entries[current].getAttribute('aria-haspopup') === 'menu') {
        entries[current].click();
        return;
      } else if (event.key === 'ArrowLeft') {
        menu.querySelector('[data-menu-back][role="menuitem"]')?.click();
        return;
      }
      if (next !== null) {
        event.preventDefault();
        event.stopPropagation();
        focusItem(next);
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [onClose, moveView, snoozeView, customSnoozeView, categorizeView, pluginSubmenu]);

  // Plugin-contributed action items (currently GTD's submenu + sidebar "Done"), spliced into the
  // Actions group at the seam below. Core stays plugin-agnostic; openSubmenu lets an item take over
  // the content area with its own submenu render.
  const pluginActionItems = usePluginCollected('context-menu-actions', {
    message, account, variant, onAction, onClose,
    openSubmenu: (render) => setPluginSubmenu(() => render),
    t,
  });

  const movePluginSections = usePluginCollected('move-picker-sections', {
    account, messages: [message], currentFolder: message.folder, onClose, t,
  });

  const items = [
    ...(isMessagePane ? [
      {
        group: 'Reading',
        actions: [
          {
            label: t('common.copy'),
            icon: <MaterialIcon name="content_copy" size={14} />,
            action: () => onAction('copySelection'),
            disabled: !hasSelectedText,
          },
          {
            label: t('messageList.selectAll'),
            icon: <MaterialIcon name="select_all" size={14} />,
            action: () => onAction('selectAllContent'),
          },
          {
            label: t('contextMenu.find'),
            icon: <MaterialIcon name="search" size={14} />,
            action: () => onAction('findInContent'),
          },
        ],
      },
      {
        group: 'Print',
        actions: [
          {
            label: t('message.print'),
            icon: <MaterialIcon name="print" size={14} />,
            action: () => onAction('print'),
          },
        ],
      },
    ] : []),
    {
      group: 'Message',
      actions: [
        ...(isMessagePane ? [] : [{
          label: t('contextMenu.open'),
          icon: <MaterialIcon name="open_in_new" size={14} />,
          action: () => onAction('open'),
        }]),
        // Detached windows don't exist on mobile — handleOpenInWindow no-ops
        // there — so hide this rather than show a dead item.
        ...(isMessagePane || isMobile ? [] : [{
          label: t('contextMenu.openInNewWindow'),
          icon: <MaterialIcon name="tab" size={14} />,
          action: () => onAction('openWindow'),
        }]),
        {
          label: hasUnread ? t('contextMenu.markRead') : t('contextMenu.markUnread'),
          icon: <MaterialIcon name={hasUnread ? "mark_email_read" : "mark_email_unread"} size={14} />,
          action: () => onAction(hasUnread ? 'markRead' : 'markUnread'),
        },
        {
          label: message.is_starred ? t('contextMenu.unstar') : t('contextMenu.star'),
          icon: <MaterialIcon name="star" size={14} style={{ color: message.is_starred ? 'var(--md-sys-color-primary)' : undefined, fontVariationSettings: message.is_starred ? '"FILL" 1' : '"FILL" 0' }} />,
          action: () => onAction('toggleStar'),
        },
        ...(!menuPolicy.select ? [] : [{
          label: t('contextMenu.select'),
          icon: <MaterialIcon name="check_box_outline_blank" size={14} />,
          action: () => onAction('bulkSelect'),
        }]),
      ]
    },
    {
      group: 'Actions',
      actions: [
        ...(!menuPolicy.compose ? [] : [{
          label: t('contextMenu.reply'),
          icon: <MaterialIcon name="reply" size={14} />,
          action: () => onAction('reply'),
        },
        {
          label: t('contextMenu.replyAll'),
          icon: <MaterialIcon name="reply_all" size={14} />,
          action: () => onAction('replyAll'),
        },
        {
          label: t('contextMenu.forward'),
          icon: <MaterialIcon name="forward" size={14} />,
          action: () => onAction('forward'),
        },
        {
          // The original as an .eml with all its headers, e.g. for SpamCop (#466).
          label: t('contextMenu.forwardAsAttachment'),
          icon: <MaterialIcon name="attach_file" size={14} />,
          action: () => onAction('forwardAsAttachment'),
        }]),
        {
          label: t('contextMenu.moveToFolder'),
          icon: <MaterialIcon name="drive_file_move" size={14} />,
          action: handleMoveClick,
          keepOpen: true,
          hasSubmenu: true,
        },
        ...(!menuPolicy.archive ? [] : [{
          label: t('contextMenu.archive'),
          icon: <MaterialIcon name="archive" size={14} />,
          action: () => onAction('archive'),
        }]),
        ...(!isSnoozed(message) && menuPolicy.snooze ? [{
          label: t('contextMenu.snooze.label'),
          icon: <MaterialIcon name="schedule" size={14} />,
          action: () => setSnoozeView(true),
          keepOpen: true,
          hasSubmenu: true,
        }] : []),
        // A snoozed message (#269): change when it comes back, with the same picker, or bring it back now.
        ...(isSnoozed(message) && menuPolicy.snooze ? [{
          label: t('contextMenu.snooze.change'),
          icon: <MaterialIcon name="schedule" size={14} />,
          action: () => setSnoozeView(true),
          keepOpen: true,
          hasSubmenu: true,
        }, {
          label: t('contextMenu.snooze.unsnooze'),
          icon: <MaterialIcon name="undo" size={14} />,
          action: () => onAction('unsnooze'),
        }] : []),
        ...(categorizationActive && menuPolicy.categorize ? [{
          label: t('contextMenu.categorize'),
          icon: <MaterialIcon name="label" size={14} />,
          action: () => setCategorizeView('message'),
          keepOpen: true,
          hasSubmenu: true,
        }] : []),
        // Plugin-contributed items (GTD's submenu + sidebar "Done") slot in here, exactly where the
        // GTD entries used to sit — after "Categorize", before "Create rule".
        ...pluginActionItems,
        ...(!menuPolicy.rules ? [] : [{
          label: t('contextMenu.createRule'),
          icon: <MaterialIcon name="rule" size={14} />,
          action: () => onAction('createRuleFromMessage'),
        },
        {
          label: t('contextMenu.addToBlockList'),
          icon: <MaterialIcon name="block" size={14} />,
          action: () => onAction('addToBlockList'),
        }]),
        // Spam / ham are only shown when there's a real destination for the
        // action: "Mark as Spam" when the message isn't already in a spam-like
        // folder, "Mark as Not Spam" when it is. They live next to "Move to
        // folder" so the antispam workflow stays discoverable.
        ...(spamFolderPaths.size > 0 && !inSpamFolder && menuPolicy.spam ? [{
          label: t('contextMenu.markAsSpam'),
          icon: <MaterialIcon name="report" size={14} />,
          action: () => onAction('markSpam'),
        }] : []),
        ...(inSpamFolder && menuPolicy.spam ? [{
          label: t('contextMenu.markAsHam'),
          icon: <MaterialIcon name="verified_user" size={14} />,
          action: () => onAction('markHam'),
        }] : []),
      ]
    },
    ...(!(menuPolicy.copy || menuPolicy.viewHeaders) ? [] : [{
      group: 'Copy',
      actions: [
        {
          label: t('contextMenu.copySubject'),
          icon: <MaterialIcon name="content_copy" size={14} />,
          action: () => { copyToClipboard(message.subject || ''); onAction('copy'); },
        },
        {
          label: t('contextMenu.copySender'),
          icon: <MaterialIcon name="mail" size={14} />,
          action: () => { copyToClipboard(message.from_email || ''); onAction('copy'); },
        },
        {
          // Durable permalink to this email: keyed on the stable Message-ID header (falls back to
          // the volatile row UUID only when absent) so it survives the message moving folders /
          // being re-synced. Resolved by /?m= on load — see MailApp deep-link handling (#270, #375).
          label: t('contextMenu.copyLink'),
          icon: <MaterialIcon name="link" size={14} />,
          action: () => {
            const ref = message.message_id || message.id;
            if (ref) copyToClipboard(`${window.location.origin}/?m=${encodeURIComponent(ref)}`);
            onAction('copy');
          },
        },
      ]
    },
    {
      group: 'View',
      actions: [
        {
          label: t('contextMenu.viewHeaders'),
          icon: <MaterialIcon name="subject" size={14} />,
          action: async () => {
            try {
              setHeaderMessage(await resolveContextMenuMessage(message, variant, api.resolveMessage));
            } catch (err) {
              console.error('Message header resolution failed:', err.message);
            }
          },
          keepOpen: true,
        },
        {
          // Raw RFC 822 source as an .eml file (#381). Resolved like View headers, so GTD rows
          // download the current copy of the message rather than a stale row.
          label: t('message.downloadEml'),
          icon: <MaterialIcon name="download" size={14} />,
          action: async () => {
            try {
              const resolved = await resolveContextMenuMessage(message, variant, api.resolveMessage);
              downloadEml(resolved?.id);
            } catch (err) {
              console.error('Message resolution for .eml download failed:', err.message);
            }
          },
        },
      ]
    }]),
    {
      group: 'Danger',
      actions: [
        {
          label: t('contextMenu.delete'),
          icon: <MaterialIcon name="delete" size={14} />,
          action: () => onAction('delete'),
          danger: true,
        },
      ]
    },
  ];

  return (
    <>
      <div onClick={onClose} aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 3999 }} />
      <div
        ref={menuRef}
        role="menu"
        aria-label={t('contextMenu.title', { defaultValue: 'Message actions' })}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 10, zIndex: 4000,
          boxShadow: 'var(--shadow-modal)',
          overflowX: 'hidden', overflowY: 'auto',
          // Mobile: a left-anchored, vertically-centered slide-out panel so the
          // (often long) menu clears the notch/Dynamic Island top and bottom.
          // Desktop: positioned at the clamped tap point.
          ...(isMobile ? {
            position: 'fixed',
            left: `calc((env(safe-area-inset-left, 0px) + 12px) / ${menuScale})`,
            // Center within the SAFE area, not the raw viewport: with
            // viewport-fit=cover the island (top inset) is taller than the home
            // indicator (bottom inset), so a plain 50% sits visibly too high.
            top: `calc(50% + (var(--sat) - var(--sab)) / ${2 * menuScale})`,
            transform: 'translateY(-50%)',
            width: `min(340px, calc((100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)) / ${menuScale}))`,
            maxHeight: `min(calc(80vh / ${menuScale}), calc((var(--app-height, 100dvh) - var(--sat, 0px) - var(--sab, 0px) - 24px) / ${menuScale}))`,
            animation: 'contextMenuSlideIn 0.18s ease',
          } : {
            position: 'fixed', left: pos.x, top: pos.y,
            width: `min(320px, calc((100vw - 16px) / ${menuScale}))`, maxHeight: descaleCss('var(--app-height, 100dvh) - var(--sat, 0px) - var(--sab, 0px) - 16px'),
            animation: 'contextMenuIn 0.12s ease',
          }),
        }}
      >
        <style>{`
          @keyframes contextMenuIn {
            from { opacity: 0; transform: scale(0.95) translateY(-4px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes contextMenuSlideIn {
            from { opacity: 0; transform: translate(-16px, -50%); }
            to   { opacity: 1; transform: translate(0, -50%); }
          }
        `}</style>

        {!isMessagePane && (
          <div style={{
            padding: '10px 14px 8px',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div style={{
              fontSize: 12, fontWeight: 500, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {message.subject || t('common.noSubject')}
            </div>
            <div style={{
              fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {message.from_name
                ? `${message.from_name} <${message.from_email}>`
                : message.from_email}
            </div>
          </div>
        )}

        {pluginSubmenu ? (
          // A plugin item opened its own submenu (e.g. GTD's classify/remove list). It renders its
          // own back row; onBack returns to the item list.
          pluginSubmenu(() => setPluginSubmenu(null))
        ) : categorizeView ? ((() => {
          // "Always for this sender/domain" needs an address to match on (#490).
          const sender = String(message.from_email || '').trim().toLowerCase();
          const at = sender.lastIndexOf('@');
          const domain = at > 0 && at < sender.length - 1 ? sender.slice(at) : '';
          const scoped = categorizeView === 'sender' || categorizeView === 'domain';
          const backRow = (label, onClick) => (
            <div data-md-state=""
              role="menuitem"
              data-menu-back
              tabIndex={-1}
              onClick={onClick}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', cursor: 'pointer',
                borderBottom: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)', fontSize: 12,
                overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
              }}
              
              
            >
              <MaterialIcon name="arrow_back" size={12} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            </div>
          );
          const row = (key, label, onClick, { current = false, submenu = false } = {}) => (
            <div data-md-state=""
              key={key}
              role="menuitem"
              aria-disabled={current || undefined}
              tabIndex={-1}
              onClick={current ? undefined : onClick}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 14px', cursor: current ? 'default' : 'pointer',
                fontSize: 13, color: current ? 'var(--text-tertiary)' : 'var(--text-primary)',
              }}
              
              
            >
              <span style={{ flex: 1 }}>{label}</span>
              {current && (
                <MaterialIcon name="check" size={13} />
              )}
              {submenu && (
                <MaterialIcon name="chevron_right" size={12} />
              )}
            </div>
          );
          if (scoped) {
            const value = categorizeView === 'sender' ? sender : domain;
            return (
              <>
                {backRow(t('contextMenu.categoryAlwaysFor', { value }), () => setCategorizeView('message'))}
                {CATEGORIES.map(cat => row(cat, t(`messageList.categories.${cat}`), () => {
                  onAction('setCategoryAlways', { scope: categorizeView, category: cat });
                  onClose();
                }))}
              </>
            );
          }
          return (
            <>
              {backRow(t('contextMenu.categorize'), () => setCategorizeView(false))}
              {CATEGORIES.map(cat => row(cat, t(`messageList.categories.${cat}`), () => {
                onAction('setCategory', cat);
                onClose();
              }, { current: (message.category || 'primary') === cat }))}
              {sender && domain && (
                <>
                  <div style={{ height: 1, background: 'var(--border-subtle)', margin: '3px 0' }} />
                  {row('always-sender', t('contextMenu.categoryAlwaysSender'), () => setCategorizeView('sender'), { submenu: true })}
                  {row('always-domain', t('contextMenu.categoryAlwaysDomain'), () => setCategorizeView('domain'), { submenu: true })}
                </>
              )}
            </>
          );
        })()
        ) : snoozeView ? (
          customSnoozeView ? (
            /* Custom date/time picker */
            <>
              <div data-md-state=""
                role="menuitem"
                data-menu-back
                tabIndex={-1}
                onClick={() => setCustomSnoozeView(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)', fontSize: 12,
                }}
                
                
              >
                <MaterialIcon name="arrow_back" size={12} />
                {t('contextMenu.snooze.label')}
              </div>
              <div style={{ padding: '10px 14px 12px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <DateTimeInput
                    type="date"
                    value={customDate}
                    min={snoozeMinDate()}
                    onChange={e => setCustomDate(e.target.value)}
                    style={{
                      flex: 1, minWidth: 168, background: 'var(--bg-hover)', border: '1px solid var(--border)',
                      borderRadius: 6, color: 'var(--text-primary)', fontSize: 12,
                      padding: '5px 6px', outline: 'none', colorScheme: 'dark light',
                    }}
                  />
                  <DateTimeInput
                    type="time"
                    value={customTime}
                    onChange={e => setCustomTime(e.target.value)}
                    style={{
                      width: 176, background: 'var(--bg-hover)', border: '1px solid var(--border)',
                      borderRadius: 6, color: 'var(--text-primary)', fontSize: 12,
                      padding: '5px 6px', outline: 'none', colorScheme: 'dark light',
                    }}
                  />
                </div>
                <MaterialButton variant="filled"
                  disabled={!customDate || !customTime}
                  onClick={() => {
                    const d = snoozeCustomUntil(customDate, customTime);
                    if (!d) return;
                    onAction(snoozeAction, d.toISOString());
                    onClose();
                  }}
                  style={{
                    width: '100%', background: 'var(--accent)', color: 'var(--accent-text)',
                    border: 'none', borderRadius: 6, padding: '7px 0',
                    fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    opacity: (!customDate || !customTime) ? 0.5 : 1,
                  }}
                >
                  {t('contextMenu.snooze.label')}
                </MaterialButton>
              </div>
            </>
          ) : (
            /* Snooze preset picker */
            <>
              <div data-md-state=""
                role="menuitem" data-menu-back tabIndex={-1}
                onClick={() => setSnoozeView(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)', fontSize: 12,
                }}
                
                
              >
                <MaterialIcon name="arrow_back" size={12} />
                {t(snoozeAction === 'changeSnooze' ? 'contextMenu.snooze.change' : 'contextMenu.snooze.label')}
              </div>
              {[
                {
                  label: t('contextMenu.snooze.threeHours'),
                  getDate: () => { const d = new Date(); d.setHours(d.getHours() + 3); return d; },
                },
                {
                  label: t('contextMenu.snooze.tomorrowMorning'),
                  getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; },
                },
                {
                  label: t('contextMenu.snooze.nextWeek'),
                  getDate: () => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d; },
                },
              ].map(({ label, getDate }) => (
                <div data-md-state=""
                  key={label}
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => { onAction(snoozeAction, getDate().toISOString()); onClose(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}
                  
                  
                >
                  <MaterialIcon name="schedule" size={14} />
                  {label}
                </div>
              ))}
              <div data-md-state=""
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  setCustomDate(snoozeDefaultDate());
                  setCustomTime(SNOOZE_DEFAULT_TIME);
                  setCustomSnoozeView(true);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}
                
                
              >
                <MaterialIcon name="calendar_month" size={14} />
                {t('contextMenu.snooze.custom')}
              </div>
            </>
          )
        ) : moveView ? (
          /* Folder picker view */
          <>
            {defaultMoveView ? (
              <div style={{
                padding: '8px 14px',
                borderBottom: '1px solid var(--border-subtle)',
                fontSize: 11, fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                {t('contextMenu.folders.back')}
              </div>
            ) : (
              <div data-md-state=""
                role="menuitem"
                data-menu-back
                tabIndex={-1}
                onClick={() => setMoveView(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)', fontSize: 12,
                }}
                
                
              >
                <MaterialIcon name="arrow_back" size={12} />
                {t('contextMenu.folders.back')}
              </div>
            )}
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
              <MaterialInput
                autoFocus={!isMobile}
                value={folderSearch}
                onChange={e => setFolderSearch(e.target.value)}
                placeholder={t('contextMenu.folders.search')}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '5px 8px', fontSize: 12,
                  background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                  borderRadius: 5, color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ maxHeight: 240, overflow: 'auto' }}>
              {moveFoldersLoading ? (
                <div style={{ padding: '12px 14px', color: 'var(--text-tertiary)', fontSize: 12 }}>
                  {t('contextMenu.folders.loading')}
                </div>
              ) : (() => {
                const sections = buildMovePickerSections({
                  folders: moveFolders || [], recents: recentFolders, favorites: favoriteFolders,
                  pluginSections: movePluginSections, accountId: message.account_id,
                  currentFolder: message.folder, query: folderSearch,
                });
                const foldersEmpty = movePickerFoldersEmpty(sections, moveFolders);
                const rendered = sections.map((section, i) => {
                  const heading = movePickerSectionHeading(section, t);
                  return (
                    <Fragment key={section.key}>
                      {heading && (
                        <div style={{ padding: '5px 14px 3px', color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {heading}
                        </div>
                      )}
                      {section.rows.map(row => row.kind === 'action' ? (
                        <FolderMenuItem
                          key={`action-${row.item.key}`}
                          icon={row.item.renderIcon(13)}
                          label={row.item.label}
                          onClick={() => runMovePickerAction(row.item, onClose)}
                        />
                      ) : (
                        <FolderMenuItem
                          key={row.folder.path}
                          folder={row.folder}
                          onClick={() => { onAction('moveTo', row.folder.path); onClose(); }}
                        />
                      ))}
                      {(i < sections.length - 1 || foldersEmpty) && <div style={{ height: 1, background: 'var(--border-subtle)', margin: '3px 0' }} />}
                    </Fragment>
                  );
                });
                return (
                  <>
                    {rendered}
                    {foldersEmpty && (
                      <div style={{ padding: '12px 14px', color: 'var(--text-tertiary)', fontSize: 12 }}>
                        {t('contextMenu.folders.empty')}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </>
        ) : (
          /* Normal groups */
          <>
            {items.map((group, gi) => (
              <div key={gi}>
                {gi > 0 && <div style={{ height: 1, background: 'var(--border-subtle)', margin: '3px 0' }} />}
                {group.actions.map((item, ai) => (
                  <MenuItem
                    key={ai}
                    icon={item.icon}
                    label={item.label}
                    danger={item.danger}
                    disabled={item.disabled}
                    hasSubmenu={item.hasSubmenu}
                    onClick={() => {
                      if (item.disabled) return;
                      item.action();
                      if (!item.keepOpen) onClose();
                    }}
                  />
                ))}
              </div>
            ))}
            <div style={{ height: 4 }} />
          </>
        )}
      </div>

      {headerMessage && (
        <MessageHeaderModal
          messageId={headerMessage.id}
          subject={headerMessage.subject}
          onClose={() => { setHeaderMessage(null); onClose(); }}
        />
      )}
    </>
  );
}

function MenuItem({ icon, label, onClick, danger, hasSubmenu, disabled }) {
  const [hov, setHov] = useState(false);
  return (
    <MaterialButton variant="menu"
      type="button"
      role="menuitem"
      aria-disabled={disabled || undefined}
      aria-haspopup={hasSubmenu ? 'menu' : undefined}
      tabIndex={-1}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', width: '100%', alignItems: 'center', gap: 10,
        padding: '7px 14px', cursor: disabled ? 'default' : 'pointer',
        background: hov && !disabled ? (danger ? 'rgba(248,113,113,0.08)' : 'var(--bg-hover)') : 'transparent',
        color: disabled ? 'var(--text-tertiary)' : danger ? (hov ? 'var(--red)' : 'var(--text-secondary)') : 'var(--text-primary)',
        transition: 'background 0.08s, color 0.08s',
        fontSize: 13,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span style={{ flexShrink: 0, color: danger && hov ? 'var(--red)' : 'var(--text-tertiary)', display: 'flex' }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {hasSubmenu && (
        <MaterialIcon name="chevron_right" size={11} />
      )}
    </MaterialButton>
  );
}

function FolderMenuItem({ folder, icon: iconOverride, label, onClick }) {
  const [hov, setHov] = useState(false);
  const su = (folder?.special_use || '').toLowerCase();
  const icon = iconOverride ? iconOverride
    : su.includes('sent')
    ? <MaterialIcon name="send" size={13} />
    : su.includes('trash')
    ? <MaterialIcon name="delete" size={13} />
    : su.includes('draft')
    ? <MaterialIcon name="edit" size={13} />
    : su.includes('spam') || su.includes('junk')
    ? <MaterialIcon name="report" size={13} />
    : <MaterialIcon name="folder" size={13} />;

  return (
    <MaterialButton variant="menu"
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', width: '100%', alignItems: 'center', gap: 10,
        padding: '7px 14px', cursor: 'pointer',
        background: hov ? 'var(--bg-hover)' : 'transparent',
        color: 'var(--text-primary)',
        transition: 'background 0.08s',
        fontSize: 13,
      }}
    >
      <span style={{ flexShrink: 0, color: 'var(--text-tertiary)', display: 'flex' }}>{icon}</span>
      {folder ? <FolderPathLabel folder={folder} label={folder.favoriteLabel} /> : <FolderPathLabel label={label} />}
    </MaterialButton>
  );
}
