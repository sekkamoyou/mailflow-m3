import MaterialNavigation from '../material/Navigation.jsx';
import { useModalFocus } from '../material/useModalFocus.js';
import { useMenuFocus } from '../material/useMenuFocus.js';
import MaterialDialog from '../material/MaterialDialog.jsx';
import { MaterialIcon } from '../material/controls.jsx';
import { MaterialButton, MaterialInput } from '../material/controls.jsx';
import { useState, useEffect, useRef, useCallback } from 'react';
import AccountMark from './AccountMark.jsx';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/index.js';
import { totalBadge, unreadBadge } from '../utils/unreadBadge.js';
import { api } from '../utils/api.js';
import { resolveThreadMessages } from '../utils/threadActions.js';
import { keepDraftsApart } from '../utils/conversationActions.js';
import { folderDisplayName, folderDisplayNameForPath, folderRole } from '../utils/folderDisplay.js';
import {
  activateOnKey,
  buildFolderTree,
  subtreeUnread,
  collapsedTooltip,
  FOLDER_ORDER_DRAG_TYPE,
  folderDropPosition,
  hasRenderedInbox,
  existingHiddenPaths,
  moveHiddenPaths,
  resolveFolderOrderDrop,
} from '../utils/sidebar.js';
import { useMobile } from '../hooks/useMobile.js';
import LogoMark from './LogoMark.jsx';
import ProfileModal from './ProfileModal.jsx';
import { useUiScale, descale } from '../hooks/useUiScale.js';
import { SNOOZED_FOLDER } from '../utils/snoozeActions.js';
import { SCHEDULED_VIEW } from '../utils/scheduledCompose.js';
import { SendLaterIcon } from './SendLater.jsx';
import { describeAccountError, needsSignIn } from '../utils/accountErrors.js';
import { holdUndoable, releaseUndoable, UNDO_COMMIT_DELAY_MS } from '../utils/undoableAction.js';

const ICONS = {
  snoozed: (
    <MaterialIcon name="schedule" />
  ),
  inbox: (
    <MaterialIcon name="inbox" />
  ),
  sent: (
    <MaterialIcon name="send" />
  ),
  drafts: (
    <MaterialIcon name="edit" />
  ),
  trash: (
    <MaterialIcon name="delete" />
  ),
  spam: (
    <MaterialIcon name="shield" />
  ),
  folder: (
    <MaterialIcon name="folder" />
  ),
  star: (
    <MaterialIcon name="star" />
  ),
  settings: (
    <MaterialIcon name="settings" />
  ),
  compose: (
    <MaterialIcon name="edit_square" />
  ),
  logout: (
    <MaterialIcon name="logout" />
  ),
  contacts: (
    <MaterialIcon name="contacts" />
  ),
};

function folderIcon(path, specialUse, folderMappings) {
  const p = (path || '').toLowerCase();
  const s = (specialUse || '').toLowerCase();
  if (s.includes('sent') || p.includes('sent') || folderMappings?.sent === path) return ICONS.sent;
  if (s.includes('drafts') || p.includes('draft') || folderMappings?.drafts === path) return ICONS.drafts;
  if (s.includes('trash') || p.includes('trash') || p.includes('deleted') || folderMappings?.trash === path) return ICONS.trash;
  if (s.includes('junk') || s.includes('spam') || p.includes('spam') || p.includes('junk') || folderMappings?.spam === path) return ICONS.spam;
  if (s.includes('flagged') || p.includes('starred')) return ICONS.star;
  if (p === 'inbox') return ICONS.inbox;
  return ICONS.folder;
}

// Folders that should not be renamed or deleted
function isProtectedFolder(folder, folderMappings) {
  const p = (folder.path || '').toLowerCase();
  const s = (folder.special_use || '').toLowerCase();
  if (folderMappings && Object.values(folderMappings).includes(folder.path)) return true;
  return (
    p === 'inbox' ||
    s.includes('sent') || s.includes('draft') || s.includes('trash') ||
    s.includes('junk') || s.includes('spam') || s.includes('archive') ||
    s.includes('flagged') || s.includes('all') ||
    p.includes('trash') || p.includes('deleted') ||
    p.startsWith('[gmail]/')
  );
}

// ─── Sidebar context menu (folders + accounts) ────────────────────────────────
function SidebarCtxMenu({ x, y, items, title, subtitle, onClose }) {
  const menuRef = useRef(null);
  useMenuFocus(menuRef, onClose);
  const uiScale = useUiScale();
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const clamp = () => {
      const rect = menu.getBoundingClientRect();
      const dx = Math.max(12, Math.min(x, window.innerWidth - rect.width - 12)) - rect.left;
      const dy = Math.max(12, Math.min(y, window.innerHeight - rect.height - 12)) - rect.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      // Queued resize callbacks must not add the same correction to pending state twice.
      setPos({ x: parseFloat(menu.style.left) * uiScale + dx, y: parseFloat(menu.style.top) * uiScale + dy });
    };
    clamp();
    const observer = new ResizeObserver(clamp);
    observer.observe(menu);
    return () => observer.disconnect();
  }, [x, y, uiScale]);

  // Keep a ref so the listener registered once on mount always calls the latest onClose
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const handleMouseDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onCloseRef.current();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  return (
    <div
      ref={menuRef} role="menu" aria-label={title || subtitle}
      style={{
        position: 'fixed', left: descale(pos.x, uiScale), top: descale(pos.y, uiScale),
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--md-sys-shape-corner-medium)', zIndex: 4000,
        boxShadow: 'var(--shadow-modal)',
        minWidth: 210, maxWidth: `calc((100vw - 24px) / ${uiScale})`,
        maxHeight: `calc((100vh - 24px) / ${uiScale})`, overflowX: 'hidden', overflowY: 'auto',
        animation: 'md-popup-enter var(--motion-fast) var(--ease-standard)',
      }}
    >
      {/* Header */}
      {(title || subtitle) && (
        <div style={{
          padding: '9px 13px 7px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          {title && (
            <div style={{
              fontSize: 'var(--md-sys-typescale-body-small-size)', fontWeight: 600, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {title}
            </div>
          )}
          {subtitle && (
            <div style={{
              fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {subtitle}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: '4px 0' }}>
        {items.map((item, i) => {
          if (item.separator) {
            return <div key={i} style={{ height: 1, background: 'var(--border-subtle)', margin: '3px 0' }} />;
          }
          return (
            <CtxMenuItem
              key={i}
              icon={item.icon}
              label={item.label}
              danger={item.danger}
              disabled={item.disabled}
              onClick={() => {
                item.action();
                if (!item.keepOpen) onClose();
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function CtxMenuItem({ icon, label, onClick, danger, disabled, menu = true }) {
  const [hov, setHov] = useState(false);
  return (
    <MaterialButton variant="menu" role={menu ? 'menuitem' : undefined} tabIndex={menu ? -1 : 0} disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '6px 13px', cursor: disabled ? 'default' : 'pointer',
        background: hov ? (danger ? 'rgba(248,113,113,0.08)' : 'var(--bg-hover)') : 'transparent',
        color: disabled
          ? 'var(--text-tertiary)'
          : danger ? (hov ? 'var(--red)' : 'var(--text-secondary)') : 'var(--text-primary)',
        transition: 'background 0.08s, color 0.08s',
        fontSize: 'var(--md-sys-typescale-body-medium-size)', opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        flexShrink: 0, display: 'flex',
        color: disabled ? 'var(--text-tertiary)' : (danger && hov ? 'var(--red)' : 'var(--text-tertiary)'),
      }}>
        {icon}
      </span>
      {label}
    </MaterialButton>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────
// A folder row's badge: its unread count, or for Drafts how many drafts it holds (#643), outlined
// rather than filled so it doesn't read as unread mail.
function folderBadge(folder, folderMappings, t) {
  if (!folder) return null;
  const counts = { known: folder.counts_known !== false, stale: folder.counts_stale };
  if (folderRole(folder, folderMappings) === 'drafts') {
    const b = totalBadge({ count: folder.total_count, ...counts });
    return b && { ...b, title: t('sidebar.draftsTotal', { n: folder.total_count }) };
  }
  return unreadBadge({ count: folder.unread_count, ...counts, observedAt: folder.server_counts_at });
}

function badgeStyle(badge) {
  return badge.total
    ? { fontSize: 10, color: 'var(--text-tertiary)', border: '1px solid var(--border)', padding: '0 4px', borderRadius: 8 }
    : { fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 8 };
}

export default function Sidebar({ onClose, expandedRail = false } = {}) {
  const { t } = useTranslation();
  const appDisplayName = useStore(state => state.appDisplayName);
  const uiScale = useUiScale();
  const {
    accounts, unreadCounts, selectedAccountId, selectedFolder,
    setSelectedAccount, setShowAdmin, setAdminTab, setAccountsIntent, openCompose,
    folders, setFolders, setAccounts, user, messagesRefreshToken, signOut, lockScreen, sidebarCollapsed: sidebarCollapsedPref, toggleSidebar,
    blockRemoteImages, setBlockRemoteImages, setMobileSidebarOpen, addNotification,
    searchAllFolders, setSearchAllFolders,
    hiddenFolders, setHiddenFolders,
    folderOrder, setFolderOrder,
    favoriteFolders, addFavoriteFolder, removeFavoriteFolder, renameFavoriteFolder, reorderFavoriteFolders,
    expandedAccounts, setExpandedAccounts,
    collapsedFolders, toggleCollapsedFolder,
    accountsReady, showContacts,
    sidebarWidth,
    isSidebarResizing,
  } = useStore();

  const isMobile = useMobile();
  // On mobile the sidebar is always expanded (shown as an overlay drawer)
  const sidebarCollapsed = !isMobile && !onClose && sidebarCollapsedPref;

  // Close the mobile drawer whenever the user navigates to a different folder/account
  useEffect(() => {
    if (onClose) onClose();
    else if (isMobile) setMobileSidebarOpen(false);
  }, [selectedAccountId, selectedFolder, messagesRefreshToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const [msgDragTarget, setMsgDragTarget] = useState(null);
  const [folderDrag, setFolderDrag] = useState(null);
  const [folderDropTarget, setFolderDropTarget] = useState(null);

  const clearFolderDrag = useCallback(() => {
    setFolderDrag(null);
    setFolderDropTarget(null);
  }, []);

  // Clear any stale drag state when a drag operation ends anywhere on the page.
  useEffect(() => {
    const clear = () => {
      setMsgDragTarget(null);
      clearFolderDrag();
    };
    document.addEventListener('dragend', clear);
    return () => document.removeEventListener('dragend', clear);
  }, [clearFolderDrag]);

  const handleMsgDrop = useCallback(async (e, targetFolder) => {
    e.preventDefault();
    setMsgDragTarget(null);
    const raw = e.dataTransfer.getData('application/x-mailflow-message');
    if (!raw) return;
    let payload;
    try { payload = JSON.parse(raw); } catch { return; }
    const state = useStore.getState();
    const pool = [...state.messages, ...state.searchResults];

    // `msgs` are the rows the list hides and puts back; `movedIds` are what the server is asked
    // to move. They are the same thing for ordinary rows and deliberately differ for a thread:
    // one visible row stands for messages that were never loaded, so the ids come from the
    // server while the row is the only thing there is to restore.
    let msgs;
    let movedIds;
    if (payload.threadId) {
      const row = pool.find(m => m.id === payload.messageId);
      if (!row) return;
      let threadMsgs;
      try {
        // The server decides what a thread contains, never the expansion-time cache — a thread
        // gains messages while you look at it, and a stale list moves some and strands the rest.
        // See utils/threadActions.js.
        threadMsgs = await resolveThreadMessages({
          message: row,
          isThreadRow: true,
          fetchThread: () => api.getThread(payload.threadId, payload.threadFolder, payload.threadUnified),
        });
      } catch (err) {
        console.error('Failed to load thread for move:', err.message);
        state.addNotification({ title: t('message.moved.failTitle'), body: t('message.moved.failBody') });
        return;
      }
      // A folder path is account-specific, and a thread can span accounts (and always includes
      // Sent copies), so scope the move to the dragged row's account exactly as the context-menu
      // move does — the server silently skips messages whose account lacks the destination.
      movedIds = [...new Set(
        keepDraftsApart(threadMsgs, row.id).filter(m => m?.account_id === row.account_id).map(m => m.id).filter(Boolean)
      )];
      if (!movedIds.length) movedIds = [row.id];
      msgs = [row];
    } else {
      const ids = payload.messageIds ?? [payload.messageId];
      msgs = ids
        .map(id => pool.find(m => m.id === id))
        .filter(m => m != null && m.folder !== targetFolder);
      movedIds = msgs.map(m => m.id);
    }
    if (!msgs.length) return;
    msgs.forEach(msg => {
      state.removeMessage(msg.id);
      if (!msg.is_read) state.decrementUnread(msg.account_id, 1, { undoable: true });
    });
    let undone = false;
    const timer = holdUndoable(async () => {
      if (undone) return;
      try {
        const result = await api.bulkMove(movedIds, targetFolder);
        const movedSet = new Set(result.moved ?? []);
        const failedIds = movedIds.filter(id => !movedSet.has(id));
        // A thread's single row stands for every id in the move, so any failure puts that row
        // back. Ordinary rows still restore only the ones that actually failed.
        const failedMsgs = payload.threadId
          ? (failedIds.length > 0 ? msgs : [])
          : msgs.filter(m => !movedSet.has(m.id));
        const s = useStore.getState();
        if (failedMsgs.length > 0) {
          s.restoreMessages(failedMsgs);
          failedMsgs.forEach(m => { if (!m.is_read) s.incrementUnread(m.account_id); });
          s.addNotification({ title: t('messageList.bulkMoved.failTitle'), body: t('messageList.bulkMoved.failBody', { count: failedIds.length }) });
        } else {
          s.recordRecentFolder({ accountId: msgs[0].account_id, path: targetFolder });
        }
      } catch {
        const s = useStore.getState();
        s.restoreMessages(msgs);
        msgs.forEach(m => { if (!m.is_read) s.incrementUnread(m.account_id); });
        s.addNotification({ title: t('messageList.bulkMoved.failTitle'), body: t('messageList.bulkMoved.failBody', { count: movedIds.length }) });
      }
    }, UNDO_COMMIT_DELAY_MS);
    state.addNotification({
      title: t('messageList.bulkMoved.title', { count: msgs.length }),
      body: targetFolder,
      onUndo: () => {
        // Already sent (a flush, as the page went into the back-forward cache): nothing to undo.
        if (!releaseUndoable(timer)) return;
        undone = true;
        const s = useStore.getState();
        s.restoreMessages(msgs);
        msgs.forEach(m => { if (!m.is_read) s.incrementUnread(m.account_id); });
      },
    });
  }, [t]);

  const [showProfile, setShowProfile] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userMenuPos, setUserMenuPos] = useState({ bottom: 0, left: 0 });
  const [bottomExpanded, setBottomExpanded] = useState(false);
  const userMenuBtnRef = useRef(null);
  const userMenuPopoverRef = useModalFocus({ enabled: userMenuOpen && !isMobile, onEscape: () => setUserMenuOpen(false) });

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e) => {
      if (
        userMenuBtnRef.current && !userMenuBtnRef.current.contains(e.target) &&
        userMenuPopoverRef.current && !userMenuPopoverRef.current.contains(e.target)
      ) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen, userMenuPopoverRef]);

  const openUserMenu = () => {
    if (!userMenuBtnRef.current) return;
    const rect = userMenuBtnRef.current.getBoundingClientRect();
    setUserMenuPos({ bottom: window.innerHeight - rect.top + 6, left: rect.left });
    setUserMenuOpen(v => !v);
  };

  // Context menus
  const [folderCtxMenu, setFolderCtxMenu] = useState(null); // {x, y, accountId, folderObj}
  const [accountCtxMenu, setAccountCtxMenu] = useState(null); // {x, y, account}

  // Inline rename (IMAP folder)
  const [renamingFolder, setRenamingFolder] = useState(null); // {accountId, path, value}
  const renameInputRef = useRef(null);

  // Inline rename (favorite alias)
  const [renamingFav, setRenamingFav] = useState(null); // {accountId, path, value}
  const renameFavInputRef = useRef(null);

  // Drag-and-drop state for favorites reorder
  const [favDragIdx, setFavDragIdx] = useState(null);
  const [favDropIdx, setFavDropIdx] = useState(null);
  const favLongPressTimer = useRef(null);
  const favTouchStart = useRef(null); // { x, y } captured at touchstart for movement threshold

  // Inline create folder
  const [creatingFolder, setCreatingFolder] = useState(null); // {accountId}
  const [createName, setCreateName] = useState('');
  const createInputRef = useRef(null);

  // Per-account toggle to reveal hidden folders
  const [showHiddenFor, setShowHiddenFor] = useState(new Set()); // Set of accountIds
  const toggleShowHidden = useCallback((accountId) => {
    setShowHiddenFor(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId); else next.add(accountId);
      return next;
    });
  }, []);

  const hideFolderFn = useCallback((accountId, path) => {
    const current = hiddenFolders[accountId] || [];
    if (current.includes(path)) return;
    setHiddenFolders({ ...hiddenFolders, [accountId]: [...current, path] });
  }, [hiddenFolders, setHiddenFolders]);

  const unhideFolderFn = useCallback((accountId, path) => {
    const current = hiddenFolders[accountId] || [];
    const next = current.filter(p => p !== path);
    const updated = { ...hiddenFolders };
    if (next.length === 0) delete updated[accountId]; else updated[accountId] = next;
    setHiddenFolders(updated);
  }, [hiddenFolders, setHiddenFolders]);

  // Keep a hidden folder hidden under the name MailFlow renamed it to, and forget one MailFlow
  // deleted, so a new folder made later with the same name is not born hidden (#694).
  const moveHiddenFolder = useCallback((accountId, oldPath, newPath) => {
    const all = useStore.getState().hiddenFolders;
    const current = all[accountId] || [];
    const next = moveHiddenPaths(current, oldPath, newPath, folders[accountId]);
    if (next.length === current.length && next.every((p, i) => p === current[i])) return;
    const updated = { ...all };
    if (next.length === 0) delete updated[accountId]; else updated[accountId] = next;
    setHiddenFolders(updated);
  }, [folders, setHiddenFolders]);

  // Loading state for folder ops
  const [folderOpLoading, setFolderOpLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onConfirm }

  const toggleAccount = (id) => {
    setExpandedAccounts(prev => ({ ...prev, [id]: !prev[id] }));
    if (!expandedAccounts[id] && !folders[id]) {
      api.getFolders(id).then(f => setFolders(id, f)).catch(console.error);
    }
  };

  // When accounts finish loading, fetch folders for any account that was
  // persisted as expanded OR has at least one favorited folder — the latter
  // ensures folderObj is always defined when the favorites context menu opens,
  // even if the user never expands that account's folder tree.
  useEffect(() => {
    if (!accountsReady) return;
    accounts.forEach(account => {
      const needsFolders = (expandedAccounts[account.id] || favoriteFolders.some(f => f.accountId === account.id))
        && !folders[account.id];
      if (needsFolders) {
        api.getFolders(account.id).then(f => setFolders(account.id, f)).catch(console.error);
      }
    });
  }, [accountsReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update-available check (#261). Reads the cached server-side status; the browser
  // never contacts GitHub. Silent on any failure.
  const [updateInfo, setUpdateInfo] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/update')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d) setUpdateInfo(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const isUnified = selectedAccountId === null;
  const snoozedCount = useStore(s => s.snoozedCount);
  const scheduledCount = useStore(s => s.scheduledCount);
  const scheduledAttention = useStore(s => s.scheduledAttention);
  const isScheduledView = isUnified && selectedFolder === SCHEDULED_VIEW;

  // Focus rename/create inputs when they appear
  useEffect(() => {
    if (renamingFolder && renameInputRef.current) renameInputRef.current.focus();
  }, [renamingFolder]);
  useEffect(() => {
    if (renamingFav && renameFavInputRef.current) renameFavInputRef.current.focus();
  }, [renamingFav]);
  useEffect(() => {
    if (creatingFolder && createInputRef.current) createInputRef.current.focus();
  }, [creatingFolder]);

  // ── Folder context menu items ──────────────────────────────────────────────
  const openFolderCtxMenu = useCallback((e, accountId, folderObj) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderCtxMenu({ x: e.clientX, y: e.clientY, accountId, folderObj });
    setAccountCtxMenu(null);
  }, []);

  const openAccountCtxMenu = useCallback((e, account) => {
    e.preventDefault();
    e.stopPropagation();
    setAccountCtxMenu({ x: e.clientX, y: e.clientY, account });
    setFolderCtxMenu(null);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleMarkAllRead = async (accountId, folder) => {
    try {
      await api.markAllRead(accountId, folder);
      window.dispatchEvent(new CustomEvent('mailflow:refresh'));
      api.getUnreadCounts().then(counts => {
        useStore.getState().setUnreadCounts(counts);
      }).catch(() => {});
      api.getFolders(accountId).then(f => setFolders(accountId, f)).catch(() => {});
    } catch (err) { console.error('markAllRead failed:', err.message); }
  };

  const handleSyncFolder = (accountId, folder) => {
    api.syncFolder(accountId, folder).catch(err => console.error('syncFolder failed:', err.message));
  };

  const handleStartRename = (accountId, folderObj) => {
    setRenamingFolder({ accountId, path: folderObj.path, value: folderObj.name, originalName: folderObj.name });
  };

  const handleRenameSubmit = async () => {
    if (!renamingFolder || !renamingFolder.value.trim()) {
      setRenamingFolder(null);
      return;
    }
    if (renamingFolder.value.trim() === renamingFolder.originalName) {
      setRenamingFolder(null);
      return;
    }
    setFolderOpLoading(true);
    try {
      const { newPath } = await api.renameFolder(renamingFolder.accountId, renamingFolder.path, renamingFolder.value.trim());
      if (newPath) moveHiddenFolder(renamingFolder.accountId, renamingFolder.path, newPath);
      const updated = await api.getFolders(renamingFolder.accountId);
      setFolders(renamingFolder.accountId, updated);
      // If we were viewing the renamed folder, navigate to it
      if (selectedAccountId === renamingFolder.accountId && selectedFolder === renamingFolder.path) {
        setSelectedAccount(renamingFolder.accountId, newPath || 'INBOX');
      }
      setRenamingFolder(null);
    } catch (err) {
      addNotification({ title: t('sidebar.renameFailed'), body: err.message });
    } finally {
      setFolderOpLoading(false);
    }
  };

  const handleDeleteFolder = (accountId, folderPath) => {
    const account = accounts.find(a => a.id === accountId);
    const name = folderDisplayNameForPath(folderPath, t, account?.folder_mappings, folders[accountId]);
    const accountLabel = account?.name || account?.email_address || '';
    setConfirmDialog({
      message: t('sidebar.confirmDelete', { name }),
      account: accountLabel,
      onConfirm: async () => {
        try {
          await api.deleteFolder(accountId, folderPath);
          moveHiddenFolder(accountId, folderPath, null);
          const updated = await api.getFolders(accountId);
          setFolders(accountId, updated);
          if (selectedAccountId === accountId && selectedFolder === folderPath) {
            setSelectedAccount(accountId, 'INBOX');
          }
        } catch (err) {
          addNotification({ title: t('sidebar.deleteFailed'), body: err.message });
        }
      },
    });
  };

  const handleEmptyFolder = (accountId, folderPath) => {
    const account = accounts.find(a => a.id === accountId);
    // The name the folder has in the sidebar, so emptying the "Deleted Items" it labels Trash
    // asks about and reports Trash (#623).
    const name = folderDisplayNameForPath(folderPath, t, account?.folder_mappings, folders[accountId]);
    const accountLabel = account?.name || account?.email_address || '';
    setConfirmDialog({
      message: t('sidebar.confirmEmpty', { name }),
      account: accountLabel,
      onConfirm: async () => {
        try {
          // The server empties in the background now (202) and broadcasts folder_emptied when
          // done, so the UI never blocks on a large folder. Show progress; the WebSocket handler
          // refreshes the view and counts on completion (or reports failure).
          await api.emptyFolder(accountId, folderPath);
          addNotification({ title: t('sidebar.emptying', { name }) });
        } catch (err) {
          addNotification({ title: t('sidebar.emptyFailed'), body: err.message });
        }
      },
    });
  };

  const handleStartCreateFolder = (accountId) => {
    setCreatingFolder({ accountId });
    setCreateName('');
    if (!expandedAccounts[accountId]) {
      setExpandedAccounts(prev => ({ ...prev, [accountId]: true }));
      if (!folders[accountId]) {
        api.getFolders(accountId).then(f => setFolders(accountId, f)).catch(console.error);
      }
    }
  };

  const handleCreateFolderSubmit = async () => {
    if (!creatingFolder || !createName.trim()) {
      setCreatingFolder(null);
      setCreateName('');
      return;
    }
    try {
      await api.createFolder(creatingFolder.accountId, createName.trim(), creatingFolder.parentPath);
      const updated = await api.getFolders(creatingFolder.accountId);
      setFolders(creatingFolder.accountId, updated);
      setCreatingFolder(null);
      setCreateName('');
    } catch (err) {
      addNotification({ title: t('sidebar.createFailed'), body: err.message });
    }
  };

  const handleMoveAccount = useCallback(async (account, direction) => {
    const idx = accounts.findIndex(a => a.id === account.id);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= accounts.length) return;
    const newOrder = [...accounts];
    newOrder[idx] = accounts[targetIdx];
    newOrder[targetIdx] = accounts[idx];
    setAccounts(newOrder);
    try {
      // The whole order, not the two swapped: accounts can share a position, and then the others
      // reshuffled on the next load (#695).
      await api.reorderAccounts(newOrder.map(a => a.id));
    } catch (err) {
      setAccounts(accounts);
      addNotification({ title: t('sidebar.accountMenu.moveFailed'), body: err.message });
    }
  }, [accounts, setAccounts, addNotification, t]);

  // ── Folder context menu items ──────────────────────────────────────────────
  const buildFolderMenuItems = (accountId, folderObj) => {
    const accountForFolder = accounts.find(a => a.id === accountId);
    const isProtected = isProtectedFolder(folderObj, accountForFolder?.folder_mappings);
    const isHidden = (hiddenFolders[accountId] || []).includes(folderObj.path);
    const isFavorite = favoriteFolders.some(f => f.accountId === accountId && f.path === folderObj.path);
    return [
      {
        label: t('sidebar.folderMenu.markAllRead'),
        icon: <MaterialIcon name="task_alt" />,
        action: () => handleMarkAllRead(accountId, folderObj.path),
      },
      {
        label: t('sidebar.folderMenu.syncFolder'),
        icon: <MaterialIcon name="sync" />,
        action: () => handleSyncFolder(accountId, folderObj.path),
      },
      { separator: true },
      {
        label: isFavorite ? t('sidebar.folderMenu.unfavorite', 'Remove from Favorites') : t('sidebar.folderMenu.favorite', 'Add to Favorites'),
        icon: <MaterialIcon name="star" />,
        action: () => isFavorite
          ? removeFavoriteFolder({ accountId, path: folderObj.path })
          : addFavoriteFolder({ accountId, path: folderObj.path }),
      },
      ...(isFavorite ? [{
        label: t('sidebar.folderMenu.renameFavorite', 'Rename favorite'),
        icon: <MaterialIcon name="edit" />,
        action: () => {
          const fav = favoriteFolders.find(f => f.accountId === accountId && f.path === folderObj.path);
          setRenamingFav({ accountId, path: folderObj.path, value: fav?.label || folderObj.name || folderObj.path.split('/').pop() || folderObj.path });
        },
      }] : []),
      { separator: true },
      {
        label: t('sidebar.folderMenu.rename'),
        icon: <MaterialIcon name="edit" />,
        action: () => handleStartRename(accountId, folderObj),
        disabled: isProtected,
      },
      {
        label: t('sidebar.folderMenu.createSubfolder'),
        icon: <MaterialIcon name="folder" />,
        action: () => {
          setCreatingFolder({ accountId, parentPath: folderObj.path });
          setCreateName('');
          if (!expandedAccounts[accountId]) setExpandedAccounts(prev => ({ ...prev, [accountId]: true }));
          // Un-collapse the target folder so the input isn't hidden with it.
          if (collapsedFolders.includes(`${accountId}:${folderObj.path}`)) {
            toggleCollapsedFolder(accountId, folderObj.path);
          }
        },
      },
      { separator: true },
      {
        label: isHidden ? t('sidebar.folderMenu.unhide') : t('sidebar.folderMenu.hide'),
        icon: isHidden
          ? <MaterialIcon name="visibility" />
          : <MaterialIcon name="visibility_off" />,
        action: () => isHidden ? unhideFolderFn(accountId, folderObj.path) : hideFolderFn(accountId, folderObj.path),
      },
      { separator: true },
      {
        label: t('sidebar.folderMenu.empty'),
        icon: <MaterialIcon name="delete" />,
        action: () => handleEmptyFolder(accountId, folderObj.path),
        danger: true,
      },
      {
        label: t('sidebar.folderMenu.delete'),
        icon: <MaterialIcon name="delete" />,
        action: () => handleDeleteFolder(accountId, folderObj.path),
        danger: true,
        disabled: isProtected,
      },
    ];
  };

  // Settings > Accounts at this account's row, where its error is explained, optionally
  // starting "Sign in again" there.
  const openAccountRow = (account, action = 'focus') => {
    setAccountsIntent({ accountId: account.id, action });
    setAdminTab('accounts');
    setShowAdmin(true);
    setMobileSidebarOpen(false);
  };

  // ── Account context menu items ─────────────────────────────────────────────
  const buildAccountMenuItems = (account) => {
    const idx = accounts.findIndex(a => a.id === account.id);
    const isFirst = idx === 0;
    const isLast = idx === accounts.length - 1;
    const items = [
      {
        label: t('sidebar.accountMenu.newFolder'),
        icon: <MaterialIcon name="folder" />,
        action: () => handleStartCreateFolder(account.id),
      },
      {
        label: t('sidebar.accountMenu.markAllRead'),
        icon: <MaterialIcon name="task_alt" />,
        action: () => handleMarkAllRead(account.id, 'INBOX'),
      },
      {
        label: t('sidebar.accountMenu.syncNow'),
        icon: <MaterialIcon name="sync" />,
        action: () => api.syncNow(account.id).catch(console.error),
      },
      {
        label: t('sidebar.accountMenu.syncFoldersNow'),
        icon: <MaterialIcon name="folder" />,
        action: () => api.syncFoldersNow(account.id).catch(console.error),
      },
      { separator: true },
    ];
    if (accounts.length > 1) {
      items.push(
        {
          label: t('sidebar.accountMenu.moveUp'),
          icon: <MaterialIcon name="expand_less" />,
          action: () => handleMoveAccount(account, 'up'),
          disabled: isFirst,
        },
        {
          label: t('sidebar.accountMenu.moveDown'),
          icon: <MaterialIcon name="expand_more" />,
          action: () => handleMoveAccount(account, 'down'),
          disabled: isLast,
        },
        { separator: true },
      );
    }
    items.push(
      {
        label: t('sidebar.accountMenu.settings'),
        icon: <MaterialIcon name="settings" />,
        action: () => { setAdminTab('accounts'); setShowAdmin(true); },
      },
      // An account whose sign-in stopped working is fixed by signing in, not by retrying.
      needsSignIn(account) ? {
        label: t('sidebar.accountMenu.signInAgain'),
        icon: <MaterialIcon name="login" />,
        action: () => openAccountRow(account, 'signIn'),
      } : {
        label: t('sidebar.accountMenu.tryAgain'),
        icon: <MaterialIcon name="sync" />,
        action: () => api.reconnectAccount(account.id).catch(console.error),
      },
    );
    return items;
  };

  return (
    <div className="material-drawer" data-collapsed={sidebarCollapsed} style={{
      width: sidebarCollapsed ? 80 : Math.max(280, sidebarWidth),
      minWidth: isMobile ? 0 : (sidebarCollapsed ? 80 : Math.max(280, sidebarWidth)),
      maxWidth: isMobile ? `calc(100vw / ${uiScale})` : undefined,
      height: isMobile ? '100%' : '100%',
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      transition: isSidebarResizing ? 'none' : 'width var(--md-sys-motion-default-spatial-standard), min-width var(--md-sys-motion-default-spatial-standard)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div className="material-drawer-header" style={{
        paddingTop: 'calc(var(--sat) + 16px)',
        paddingBottom: 'calc(16px - var(--sat-trim))', paddingLeft: 12, paddingRight: 12,
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)',
        minHeight: 56, flexShrink: 0,
      }}>
        {!sidebarCollapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <LogoMark size={24} />
            <span className="material-instance-name">{appDisplayName}</span>
          </div>
        )}
        <MaterialButton variant="icon"
          onClick={onClose || (isMobile ? () => setMobileSidebarOpen(false) : toggleSidebar)}
          title={onClose || isMobile ? t('common.cancel') : t('sidebar.toggleSidebar')}
          className="btn-press"
          style={{
            background: 'transparent', border: '1px solid transparent', color: 'var(--text-secondary)',
            cursor: 'pointer', padding: 6, borderRadius: 'var(--md-sys-shape-corner-small)', transition: 'all 0.1s',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginLeft: sidebarCollapsed ? 'auto' : 0,
          }}
          
          
        >
          {isMobile || onClose ? (
            <MaterialIcon name="close" />
          ) : (
            <MaterialIcon name="menu" />
          )}
        </MaterialButton>
      </div>

      {/* Compose button */}
      <div className="material-compose-slot" style={{ padding: '12px 10px' }}>
        <MaterialButton
          onClick={() => openCompose({})}
          variant="fab" className="btn-press"
          style={{
            width: '100%', padding: sidebarCollapsed ? '10px' : '10px 14px',
            background: 'var(--accent)', border: 'none', borderRadius: 'var(--md-sys-shape-corner-small)',
            color: 'var(--accent-text)', fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 500,
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: 8, transition: 'opacity 0.15s',
          }}
          
          
        >
          {ICONS.compose}
          {!sidebarCollapsed && t('sidebar.compose')}
        </MaterialButton>
      </div>

      {expandedRail && <MaterialNavigation layout={sidebarCollapsed ? 'rail' : 'expanded'} />}

      <nav data-mailbox-sidebar="" style={{ flex: 1, overflow: 'hidden auto', padding: '4px 8px' }}>
        {/* Unified Inbox — only shown with 2+ enabled accounts */}
        {accounts.filter(a => a.enabled).length >= 2 && (
          <NavItem
            mailboxRow
            icon={ICONS.inbox}
            label={t('sidebar.allInboxes')}
            active={isUnified && selectedFolder !== SNOOZED_FOLDER && !isScheduledView && !showContacts}
            collapsed={sidebarCollapsed}
            badge={unreadCounts.total}
            badgeStale={!unreadCounts.complete}
            onClick={() => setSelectedAccount(null, 'INBOX')}
          />
        )}

        {/* Snoozed (#269): every account's snoozed mail in one place, soonest back first. Shown
            while something is snoozed, and while it is open, so unsnoozing the last message does
            not pull it away from under the reader. */}
        {(snoozedCount > 0 || (isUnified && selectedFolder === SNOOZED_FOLDER)) && (
          <NavItem
            mailboxRow
            icon={ICONS.snoozed}
            label={t('sidebar.snoozed')}
            active={isUnified && selectedFolder === SNOOZED_FOLDER && !showContacts}
            collapsed={sidebarCollapsed}
            onClick={() => setSelectedAccount(null, SNOOZED_FOLDER)}
          />
        )}

        {/* Scheduled (#543, design 5.2): every account's scheduled messages. Shown, like Snoozed,
            while there is any (pending or needing attention) and while it is open. The badge is the
            pending count; a red dot and the tooltip say how many need attention. */}
        {(scheduledCount > 0 || scheduledAttention > 0 || isScheduledView) && (
          <NavItem
            mailboxRow
            icon={<SendLaterIcon size={16} />}
            label={t('sidebar.scheduled')}
            active={isScheduledView && !showContacts}
            collapsed={sidebarCollapsed}
            badge={scheduledCount}
            badgeTitle={t('sidebar.scheduledPending', { n: scheduledCount })}
            alert={scheduledAttention > 0 ? t('sidebar.scheduledAttention', { n: scheduledAttention }) : null}
            onClick={() => setSelectedAccount(null, SCHEDULED_VIEW)}
          />
        )}

        {/* Favorites section */}
        {!sidebarCollapsed && favoriteFolders.length > 0 && (() => {
          const visibleFaves = favoriteFolders.filter(({ accountId }) => accounts.some(a => a.id === accountId && a.enabled));
          if (!visibleFaves.length) return null;
          return (
            <>
              <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-tertiary)', padding: '8px 10px 3px' }}>
                {t('sidebar.favorites', 'Favorites')}
              </div>
              {visibleFaves.map((fav, idx) => {
                const { accountId, path, label } = fav;
                const account = accounts.find(a => a.id === accountId);
                if (!account) return null;
                const accountFolders = folders[accountId] || [];
                const folderObj = accountFolders.find(f => f.path === path);
                const isActive = selectedAccountId === accountId && selectedFolder === path;
                const favBadge = folderBadge(folderObj, account.folder_mappings, t);
                const isRenamingThis = renamingFav?.accountId === accountId && renamingFav?.path === path;
                const isDragging = favDragIdx === idx;
                const isDropTarget = favDropIdx === idx && favDragIdx !== null && favDragIdx !== idx;
                const canDrag = visibleFaves.length >= 2;
                return (
                  <div data-md-state=""
                    key={`${accountId}:${path}`}
                    data-mailbox-row=""
                    className="no-callout"
                    onDragOver={e => {
                      e.preventDefault();
                      if (e.dataTransfer.types.includes('application/x-mailflow-message')) {
                        e.dataTransfer.dropEffect = 'move';
                        setMsgDragTarget(`${accountId}:${path}`);
                      } else if (canDrag) {
                        setFavDropIdx(idx);
                      }
                    }}
                    onDragLeave={e => {
                      if (!e.currentTarget.contains(e.relatedTarget)) setMsgDragTarget(null);
                    }}
                    onDrop={e => {
                      if (e.dataTransfer.types.includes('application/x-mailflow-message')) {
                        handleMsgDrop(e, path);
                        return;
                      }
                      e.preventDefault();
                      if (canDrag && favDragIdx !== null && favDragIdx !== idx) {
                        const fullArr = [...favoriteFolders];
                        const fromItem = visibleFaves[favDragIdx];
                        const toItem = visibleFaves[idx];
                        const fromFullIdx = fullArr.findIndex(f => f.accountId === fromItem.accountId && f.path === fromItem.path);
                        const toFullIdx = fullArr.findIndex(f => f.accountId === toItem.accountId && f.path === toItem.path);
                        if (fromFullIdx !== -1 && toFullIdx !== -1) {
                          const [moved] = fullArr.splice(fromFullIdx, 1);
                          fullArr.splice(toFullIdx, 0, moved);
                          reorderFavoriteFolders(fullArr);
                        }
                      }
                      setFavDragIdx(null);
                      setFavDropIdx(null);
                    }}
                    onDragEnd={canDrag ? () => { setFavDragIdx(null); setFavDropIdx(null); } : undefined}
                    onClick={() => { if (!isRenamingThis) setSelectedAccount(accountId, path); }}
                    onTouchStart={e => {
                      if (isRenamingThis) return;
                      // Prevent iOS from processing this touch natively (drag mode,
                      // text selection, "Copy | Look Up | Translate" callout).
                      // touch-action: pan-y on the row lets the sidebar still scroll
                      // vertically despite this preventDefault call.
                      e.preventDefault();
                      const touch = e.touches[0];
                      const x = touch.clientX;
                      const y = touch.clientY;
                      favTouchStart.current = { x, y };
                      favLongPressTimer.current = setTimeout(() => {
                        favLongPressTimer.current = null;
                        favTouchStart.current = null;
                        window.getSelection()?.removeAllRanges();
                        if (folderObj) {
                          setFolderCtxMenu({ x, y, accountId, folderObj });
                          setAccountCtxMenu(null);
                        }
                      }, 500);
                    }}
                    onTouchMove={e => {
                      if (!favLongPressTimer.current || !favTouchStart.current) return;
                      const touch = e.touches[0];
                      const dx = Math.abs(touch.clientX - favTouchStart.current.x);
                      const dy = Math.abs(touch.clientY - favTouchStart.current.y);
                      if (dx > 10 || dy > 10) {
                        clearTimeout(favLongPressTimer.current);
                        favLongPressTimer.current = null;
                        favTouchStart.current = null;
                      }
                    }}
                    onTouchEnd={() => {
                      if (favLongPressTimer.current) {
                        // Timer still pending → short tap, not a long-press
                        clearTimeout(favLongPressTimer.current);
                        favLongPressTimer.current = null;
                        favTouchStart.current = null;
                        if (!isRenamingThis) setSelectedAccount(accountId, path);
                      }
                    }}
                    onTouchCancel={() => {
                      clearTimeout(favLongPressTimer.current);
                      favLongPressTimer.current = null;
                      favTouchStart.current = null;
                    }}
                    onContextMenu={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Desktop right-click only — touch is fully handled above
                      if (e.pointerType !== 'touch' && folderObj) {
                        setFolderCtxMenu({ x: e.clientX, y: e.clientY, accountId, folderObj });
                        setAccountCtxMenu(null);
                      }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center',
                      gap: 8, padding: '7px 10px',
                      borderRadius: 'var(--md-sys-shape-corner-small)', cursor: 'pointer',
                      touchAction: 'pan-y',
                      background: (msgDragTarget === `${accountId}:${path}`) ? 'var(--accent-dim)' : isActive ? 'var(--bg-hover)' : 'transparent',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                      transition: 'background 0.1s, color 0.1s',
                      opacity: isDragging ? 0.4 : 1,
                      borderTop: isDropTarget ? '2px solid var(--accent)' : '2px solid transparent',
                    }}
                    
                    
                  >
                    {canDrag && (
                      <span
                        draggable={!isMobile}
                        onDragStart={!isMobile ? () => { setFavDragIdx(idx); setFavDropIdx(null); } : undefined}
                        style={{ color: 'var(--text-tertiary)', flexShrink: 0, display: 'flex', opacity: 0.4, cursor: isMobile ? 'default' : 'grab' }}
                      >
                        <MaterialIcon name="drag_indicator" />
                      </span>
                    )}
                    <span style={{ color: 'var(--text-tertiary)', flexShrink: 0, display: 'flex' }}>
                      {folderIcon(path, folderObj?.special_use, account.folder_mappings)}
                    </span>
                    {isRenamingThis ? (
                      <MaterialInput
                        ref={renameFavInputRef}
                        value={renamingFav.value}
                        onChange={e => setRenamingFav(prev => ({ ...prev, value: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            renameFavoriteFolder({ accountId, path, label: renamingFav.value.trim() });
                            setRenamingFav(null);
                          }
                          if (e.key === 'Escape') setRenamingFav(null);
                          e.stopPropagation();
                        }}
                        onBlur={() => setRenamingFav(null)}
                        onClick={e => e.stopPropagation()}
                        style={{
                          flex: 1, fontSize: 'var(--md-sys-typescale-body-medium-size)', background: 'var(--bg-primary)',
                          border: '1px solid var(--accent)', borderRadius: 'var(--md-sys-shape-corner-extra-small)',
                          color: 'var(--text-primary)', padding: '2px 6px', outline: 'none', minWidth: 0,
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: isActive ? 500 : 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label || (folderObj ? folderDisplayName(folderObj, t, account.folder_mappings, accountFolders) : (path.split('/').pop() || path))}
                      </span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      {favBadge && (
                        <span title={favBadge.title} style={badgeStyle(favBadge)}>
                          {favBadge.text}
                        </span>
                      )}
                      <AccountMark accountId={account.id} color={account.color} size={6} />
                    </div>
                  </div>
                );
              })}
              {favDragIdx !== null && (
                <div
                  onDragOver={e => { e.preventDefault(); setFavDropIdx(visibleFaves.length); }}
                  onDrop={e => {
                    e.preventDefault();
                    if (favDragIdx !== null && favDragIdx !== visibleFaves.length - 1) {
                      const fullArr = [...favoriteFolders];
                      const fromItem = visibleFaves[favDragIdx];
                      const fromFullIdx = fullArr.findIndex(f => f.accountId === fromItem.accountId && f.path === fromItem.path);
                      if (fromFullIdx !== -1) {
                        const [moved] = fullArr.splice(fromFullIdx, 1);
                        fullArr.push(moved);
                        reorderFavoriteFolders(fullArr);
                      }
                    }
                    setFavDragIdx(null);
                    setFavDropIdx(null);
                  }}
                  style={{ height: 6, borderTop: favDropIdx === visibleFaves.length ? '2px solid var(--accent)' : '2px solid transparent' }}
                />
              )}
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 4px 4px' }} />
            </>
          );
        })()}

        {/* Per-account */}
        {accounts.filter(account => account.enabled).map(account => {
          const countSnapshot = unreadCounts.snapshots?.[account.id];
          const accountBadge = unreadBadge({ count: unreadCounts.byAccount[account.id],
            known: Number.isFinite(unreadCounts.byAccount[account.id]) && countSnapshot?.known !== false,
            stale: countSnapshot?.stale, observedAt: countSnapshot?.observedAt, max: 999 });
          const expanded = expandedAccounts[account.id];
          const isSelected = selectedAccountId === account.id;
          const accountFolders = folders[account.id] || [];
          // Only hidden folders that still exist: a deleted one must not keep the toggle (#694).
          const accountHiddenPaths = existingHiddenPaths(hiddenFolders[account.id], accountFolders);
          const showingHidden = showHiddenFor.has(account.id);

          const selectInbox = () => setSelectedAccount(account.id, 'INBOX');
          const rowLabel = collapsedTooltip(account.email_address, sidebarCollapsed);
          const hasInbox = hasRenderedInbox(accountFolders, {
            expanded,
            sidebarCollapsed,
            hiddenPaths: accountHiddenPaths,
            showingHidden,
          });
          const isAccountActive = isSelected && selectedFolder === 'INBOX' && !hasInbox;

          return (
            <div key={account.id}>
              {/* Only the collapsed row may carry a button role: expanded, it holds
                  the expand toggle, and a button cannot nest inside a button. */}
              <div data-md-state=""
                data-mailbox-row=""
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: sidebarCollapsed ? '8px' : '7px 10px',
                  borderRadius: 'var(--md-sys-shape-corner-small)', cursor: 'pointer',
                  background: isAccountActive ? 'var(--bg-hover)' : 'transparent',
                  transition: 'background 0.1s',
                  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                  margin: '1px 0',
                }}
                
                
                onClick={selectInbox}
                onContextMenu={!sidebarCollapsed ? (e) => openAccountCtxMenu(e, account) : undefined}
                title={rowLabel}
                aria-label={rowLabel}
                role={sidebarCollapsed ? 'button' : undefined}
                tabIndex={sidebarCollapsed ? 0 : undefined}
                onKeyDown={sidebarCollapsed ? activateOnKey(selectInbox) : undefined}
              >
                {/* Account indicator */}
                {sidebarCollapsed ? (
                  <div style={{
                    width: 28, height: 28, borderRadius: 'var(--md-sys-shape-corner-small)',
                    background: account.color + '22',
                    border: `1px solid ${account.color}66`,
                    flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 'var(--md-sys-typescale-body-small-size)', fontWeight: 600, color: account.color,
                    outline: account.sync_error ? '2px solid rgba(248,113,113,0.5)' : 'none',
                    userSelect: 'none',
                  }}>
                    {(account.name || account.email_address || '?').charAt(0).toUpperCase()}
                  </div>
                ) : (
                  <AccountMark accountId={account.id} color={account.color} size={8} style={{
                    boxShadow: account.sync_error ? '0 0 0 2px rgba(248,113,113,0.4)' : 'none',
                  }} />
                )}

                {!sidebarCollapsed && (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--text-primary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        fontWeight: accountBadge ? 500 : 400,
                      }}>
                        {account.name}
                      </div>
                      {!account.sync_error && (
                        <div style={{
                          fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {account.email_address}
                        </div>
                      )}
                      {account.sync_error && (
                        <MaterialButton variant="text"
                          type="button"
                          onClick={e => { e.stopPropagation(); openAccountRow(account); }}
                          title={t('accountErrors.label.openRow')}
                          style={{
                            display: 'block', padding: 0, border: 'none', background: 'none', cursor: 'pointer',
                            fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--red)', textAlign: 'left', textDecoration: 'underline',
                            textDecorationStyle: 'dotted', textUnderlineOffset: 2,
                          }}
                        >
                          {t(describeAccountError(account).labelKey)}
                        </MaterialButton>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      {accountBadge && (
                        <span title={accountBadge.title} style={{
                          fontSize: 'var(--md-sys-typescale-body-small-size)', fontWeight: 600, color: 'white',
                          background: account.color, padding: '1px 6px',
                          borderRadius: 'var(--md-sys-shape-corner-medium)', minWidth: 20, textAlign: 'center',
                        }}>
                          {accountBadge.text}
                        </span>
                      )}
                      {/* Expand toggle */}
                      <MaterialButton variant="icon"
                        aria-label={expanded ? t('message.aiCollapse') : t('message.aiExpand')} aria-expanded={expanded}
                        onClick={e => { e.stopPropagation(); toggleAccount(account.id); }}
                        style={{
                          background: 'none', border: 'none', padding: 2,
                          color: 'var(--text-tertiary)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center',
                          transform: expanded ? 'rotate(90deg)' : 'none',
                          transition: 'transform 0.15s',
                        }}
                      >
                        <MaterialIcon name="chevron_right" />
                      </MaterialButton>
                    </div>
                  </>
                )}
              </div>

              {/* Folder tree */}
              {expanded && !sidebarCollapsed && (() => {
                const BASE_INDENT = 8;
                const DEPTH_INDENT = 16;

                const createFolderInput = (indent) => (
                  <div style={{
                    pointerEvents: 'auto',
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: `6px 10px 6px ${indent}px`, borderRadius: 'var(--md-sys-shape-corner-small)',
                    margin: '1px 0',
                  }}>
                    {/* No folder icon here: at deep indents its footprint squeezes
                        the input to a sliver, and the indent alone already places
                        the row among its future siblings. */}
                    <MaterialInput
                      ref={createInputRef}
                      value={createName}
                      onChange={e => setCreateName(e.target.value)}
                      placeholder={creatingFolder?.parentPath ? t('sidebar.subfolderPh') : t('sidebar.folderPh')}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleCreateFolderSubmit();
                        if (e.key === 'Escape') { setCreatingFolder(null); setCreateName(''); }
                        e.stopPropagation();
                      }}
                      style={{
                        flex: 1, fontSize: 'var(--md-sys-typescale-body-small-size)', background: 'var(--bg-primary)',
                        border: '1px solid var(--accent)', borderRadius: 'var(--md-sys-shape-corner-extra-small)',
                        color: 'var(--text-primary)', padding: '2px 6px', outline: 'none', minWidth: 0,
                      }}
                    />
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <MaterialButton variant="filled" onClick={handleCreateFolderSubmit} style={{ background: 'var(--accent)', border: 'none', borderRadius: 'var(--md-sys-shape-corner-extra-small)', color: 'var(--accent-text)', padding: '2px 6px', cursor: 'pointer', fontSize: 'var(--md-sys-typescale-body-small-size)' }}>✓</MaterialButton>
                      <MaterialButton variant="text" onClick={() => { setCreatingFolder(null); setCreateName(''); }} style={{ background: 'var(--bg-tertiary)', border: 'none', borderRadius: 'var(--md-sys-shape-corner-extra-small)', color: 'var(--text-secondary)', padding: '2px 6px', cursor: 'pointer', fontSize: 'var(--md-sys-typescale-body-small-size)' }}>✕</MaterialButton>
                    </div>
                  </div>
                );

                const handleFolderOrderDragStart = (event, path) => {
                  event.stopPropagation();
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData(
                    FOLDER_ORDER_DRAG_TYPE,
                    JSON.stringify({ accountId: account.id, path }),
                  );
                  setMsgDragTarget(null);
                  setFolderDrag({ accountId: account.id, path });
                  setFolderDropTarget(null);
                };

                const handleFolderOrderDragOver = (event, path, siblings) => {
                  if (!event.dataTransfer.types.includes(FOLDER_ORDER_DRAG_TYPE)) return false;
                  event.preventDefault();
                  event.stopPropagation();
                  const validTarget = (
                    folderDrag?.accountId === account.id
                    && folderDrag.path !== path
                    && siblings.some(sibling => sibling.path === folderDrag.path)
                  );
                  event.dataTransfer.dropEffect = validTarget ? 'move' : 'none';
                  if (!validTarget) {
                    setFolderDropTarget(null);
                    return true;
                  }
                  setFolderDropTarget({
                    accountId: account.id,
                    path,
                    position: folderDropPosition(
                      event.clientY,
                      event.currentTarget.getBoundingClientRect(),
                    ),
                  });
                  return true;
                };

                const handleFolderOrderDrop = (event, path) => {
                  if (!event.dataTransfer.types.includes(FOLDER_ORDER_DRAG_TYPE)) return false;
                  event.preventDefault();
                  event.stopPropagation();
                  const next = resolveFolderOrderDrop(
                    accountFolders,
                    folderOrder[account.id],
                    event.dataTransfer,
                    account.id,
                    path,
                    event.clientY,
                    event.currentTarget.getBoundingClientRect(),
                  );
                  if (next) setFolderOrder(account.id, next);
                  clearFolderDrag();
                  return true;
                };

                const renderNode = (node, depth, siblings) => {
                  const { children, ...folder } = node;
                  const isHidden = accountHiddenPaths.includes(folder.path);
                  if (isHidden && !showingHidden) return null;

                  const isRenaming = renamingFolder?.accountId === account.id && renamingFolder?.path === folder.path;
                  const isFolderSelected = selectedAccountId === account.id && selectedFolder === folder.path;
                  const visibleChildren = showingHidden ? children : children.filter(c => !accountHiddenPaths.includes(c.path));
                  const hasChildren = visibleChildren.length > 0;
                  const collapseKey = `${account.id}:${folder.path}`;
                  const isExpanded = !collapsedFolders.includes(collapseKey);
                  const indent = BASE_INDENT + depth * DEPTH_INDENT;
                  const canReorder = !isMobile && siblings.length >= 2;
                  const dropPosition = (
                    folderDropTarget?.accountId === account.id
                    && folderDropTarget.path === folder.path
                  ) ? folderDropTarget.position : null;

                  return (
                    // The wrapper takes no pointer events of its own. Under fractional display
                    // scaling (a 175% Windows desktop) row boundaries land on fractional pixels,
                    // and at that seam this element, which has no drag handling, won the hit
                    // test: a one-frame "cannot drop" while dragging past. Its interactive
                    // descendants opt back in.
                    <div key={folder.path} style={{ pointerEvents: 'none', ...(isHidden ? { opacity: 0.45 } : null) }}>
                      <div className="md-folder-row" data-folder-depth={depth} data-md-state=""
                        data-mailbox-row={folder.no_select || isHidden ? undefined : ''}
                        data-mailbox-available={folder.no_select || isHidden ? 'false' : 'true'}
                        style={{
                          pointerEvents: 'auto',
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: `6px 10px 6px ${indent}px`, borderRadius: 'var(--md-sys-shape-corner-small)',
                          margin: '1px 0',
                          cursor: isRenaming ? 'default' : 'pointer',
                          background: (msgDragTarget === `${account.id}:${folder.path}`) ? 'var(--accent-dim)' : isFolderSelected ? 'var(--bg-hover)' : 'transparent',
                          transition: 'background 0.1s',
                          boxShadow: dropPosition === 'before'
                            ? 'inset 0 2px var(--accent)'
                            : dropPosition === 'after'
                              ? 'inset 0 -2px var(--accent)'
                              : 'none',
                        }}
                        
                        
                        onClick={() => !isRenaming && setSelectedAccount(account.id, folder.path)}
                        onContextMenu={e => openFolderCtxMenu(e, account.id, folder)}
                        onDragOver={event => {
                          if (handleFolderOrderDragOver(event, folder.path, siblings)) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                          setMsgDragTarget(`${account.id}:${folder.path}`);
                        }}
                        onDragLeave={event => {
                          if (event.currentTarget.contains(event.relatedTarget)) return;
                          setMsgDragTarget(null);
                          if (
                            folderDropTarget?.accountId === account.id
                            && folderDropTarget.path === folder.path
                          ) setFolderDropTarget(null);
                        }}
                        onDrop={event => {
                          if (handleFolderOrderDrop(event, folder.path)) return;
                          handleMsgDrop(event, folder.path);
                        }}
                      >
                        {canReorder ? (
                          <span
                            className="md-folder-drag" draggable
                            onDragStart={event => handleFolderOrderDragStart(event, folder.path)}
                            onDragEnd={clearFolderDrag}
                            title={t('sidebar.reorderFolder', 'Drag to reorder folder')}
                            style={{
                              color: 'var(--text-tertiary)', flexShrink: 0,
                              display: 'flex', opacity: 0.4, cursor: 'grab',
                            }}
                          >
                            <MaterialIcon name="drag_indicator" />
                          </span>
                        ) : !isMobile && (
                          // Keep single-child rows aligned with siblings that have a
                          // drag handle — without this spacer the missing handle
                          // visually cancels the depth indent.
                          <span className="md-folder-drag" />
                        )}
                        {/* Chevron toggle for parent folders; invisible spacer for leaf folders to align icons */}
                        {hasChildren ? (
                          <MaterialButton variant="icon" className="md-folder-toggle" aria-expanded={isExpanded}
                            onClick={e => { e.stopPropagation(); toggleCollapsedFolder(account.id, folder.path); }}
                            style={{
                              background: 'none', border: 'none', padding: 2, margin: 0, flexShrink: 0,
                              color: 'var(--text-tertiary)', cursor: 'pointer',
                              display: 'flex', alignItems: 'center',
                              transform: isExpanded ? 'rotate(90deg)' : 'none',
                              transition: 'transform 0.15s',
                            }}
                          >
                            <MaterialIcon name="chevron_right" />
                          </MaterialButton>
                        ) : (
                          <span className="md-folder-toggle-space" />
                        )}

                        <span style={{ color: 'var(--text-tertiary)', flexShrink: 0, display: 'flex' }}>
                          {folderIcon(folder.path, folder.special_use, account.folder_mappings)}
                        </span>

                        {isRenaming ? (
                          <MaterialInput
                            ref={renameInputRef}
                            value={renamingFolder.value}
                            onChange={e => setRenamingFolder(prev => ({ ...prev, value: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleRenameSubmit();
                              if (e.key === 'Escape') setRenamingFolder(null);
                              e.stopPropagation();
                            }}
                            onClick={e => e.stopPropagation()}
                            style={{
                              flex: 1, fontSize: 'var(--md-sys-typescale-body-small-size)', background: 'var(--bg-primary)',
                              border: '1px solid var(--accent)', borderRadius: 'var(--md-sys-shape-corner-extra-small)',
                              color: 'var(--text-primary)', padding: '2px 6px', outline: 'none', minWidth: 0,
                            }}
                          />
                        ) : (
                          <span className="md-folder-label" title={folder.path} style={{
                            fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-secondary)',
                            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {folderDisplayName(folder, t, account.folder_mappings, accountFolders)}
                          </span>
                        )}

                        {isRenaming ? (
                          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                            <MaterialButton variant="filled" onClick={handleRenameSubmit} disabled={folderOpLoading} style={{ background: 'var(--accent)', border: 'none', borderRadius: 'var(--md-sys-shape-corner-extra-small)', color: 'var(--accent-text)', padding: '2px 6px', cursor: 'pointer', fontSize: 'var(--md-sys-typescale-body-small-size)' }}>
                              {folderOpLoading ? '…' : '✓'}
                            </MaterialButton>
                            <MaterialButton variant="text" onClick={() => setRenamingFolder(null)} style={{ background: 'var(--bg-tertiary)', border: 'none', borderRadius: 'var(--md-sys-shape-corner-extra-small)', color: 'var(--text-secondary)', padding: '2px 6px', cursor: 'pointer', fontSize: 'var(--md-sys-typescale-body-small-size)' }}>✕</MaterialButton>
                          </div>
                        ) : (
                          (() => {
                            // Collapsed with subfolders: the total including them (#536).
                            const rolledUp = hasChildren && !isExpanded;
                            if (folder.no_select && !rolledUp) return null;
                            const b = rolledUp
                              ? unreadBadge(subtreeUnread(node, path => accountHiddenPaths.includes(path)))
                              : folderBadge(folder, account.folder_mappings, t);
                            return b && (
                              <span title={rolledUp ? `${b.title}, including subfolders` : b.title} style={{ ...badgeStyle(b), flexShrink: 0 }}>
                                {b.text}
                              </span>
                            );
                          })()
                        )}
                      </div>

                      {/* Children — shown when expanded */}
                      {hasChildren && isExpanded && (
                        visibleChildren.map(child => renderNode(child, depth + 1, visibleChildren))
                      )}
                      {/* Subfolder-create input — outside the children block so it
                          also renders on leaf folders (gated inside it, "New
                          subfolder" on a childless folder silently did nothing). */}
                      {creatingFolder?.accountId === account.id && creatingFolder?.parentPath === folder.path &&
                        createFolderInput(BASE_INDENT + (depth + 1) * DEPTH_INDENT)}
                    </div>
                  );
                };

                const tree = buildFolderTree(accountFolders, folderOrder[account.id]);
                const visibleTree = showingHidden
                  ? tree
                  : tree.filter(node => !accountHiddenPaths.includes(node.path));
                return (
                  <div style={{ marginTop: 2 }}>
                    {visibleTree.map(node => renderNode(node, 0, visibleTree))}
                    {/* Show/hide hidden folders toggle */}
                    {accountHiddenPaths.length > 0 && (
                      <MaterialButton variant="text"
                        onClick={() => toggleShowHidden(account.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '4px 10px 4px 26px', borderRadius: 'var(--md-sys-shape-corner-small)',
                          margin: '1px 0',
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: showingHidden ? 'var(--accent)' : 'var(--text-tertiary)',
                          fontSize: 'var(--md-sys-typescale-body-small-size)', width: '100%', transition: 'color 0.1s',
                        }}
                        
                        
                      >
                        <MaterialIcon name="visibility" />
                        {showingHidden ? t('sidebar.hideHidden') : t('sidebar.hiddenFolders', { count: accountHiddenPaths.length })}
                      </MaterialButton>
                    )}
                    {/* Root-level create or "New folder" button */}
                    {creatingFolder?.accountId === account.id && !creatingFolder?.parentPath
                      ? createFolderInput(BASE_INDENT)
                      : (
                        <MaterialButton variant="text"
                          onClick={() => handleStartCreateFolder(account.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '5px 10px 5px 26px', borderRadius: 'var(--md-sys-shape-corner-small)',
                            margin: '1px 0',
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-tertiary)', fontSize: 'var(--md-sys-typescale-body-small-size)', width: '100%',
                            transition: 'color 0.1s',
                          }}
                          
                          
                        >
                          <MaterialIcon name="add" />
                          {t('sidebar.newFolder')}
                        </MaterialButton>
                      )
                    }
                  </div>
                );
              })()}
            </div>
          );
        })}
      </nav>

      {/* Bottom — mobile: inline user section; desktop: user menu button */}
      {isMobile ? (
        <div className="material-mobile-account" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {/* User identity — tap to expand/collapse actions */}
          <MaterialButton variant="navigation" type="button" aria-expanded={bottomExpanded}
            onClick={() => setBottomExpanded(prev => !prev)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              paddingTop: 12, paddingLeft: 14, paddingRight: 14,
              paddingBottom: bottomExpanded ? 10 : 'calc(var(--sab) + 10px)',
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            {user?.avatar ? (
              <img src={user.avatar} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 700, color: 'var(--accent-text)',
              }}>
                {((user?.displayName || user?.username || '?')[0]).toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 600, color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {user?.displayName || user?.username || 'Account'}
              </div>
              {user?.email && (
                <div style={{
                  fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {user.email}
                </div>
              )}
            </div>
            <MaterialIcon name="expand_more" />
          </MaterialButton>

          {bottomExpanded && (
          <>
          {/* Block remote images */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 16px', cursor: 'default',
          }}>
            <span style={{ color: 'var(--text-tertiary)', display: 'flex', flexShrink: 0 }}>
              <MaterialIcon name="shield" />
            </span>
            <span style={{ flex: 1, fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--text-primary)' }}>{t('sidebar.blockImages')}</span>
            <MaterialButton aria-label={t('sidebar.blockImages')} aria-checked={blockRemoteImages} role="switch" variant="switch" selected={blockRemoteImages}
              onClick={async () => {
                try { await setBlockRemoteImages(!blockRemoteImages); }
                catch { addNotification({ title: t('message.whitelistFail.title') }); }
              }}
              style={{
                width: 36, height: 20, borderRadius: 'var(--md-sys-shape-corner-medium)', border: 'none', cursor: 'pointer',
                background: blockRemoteImages ? 'var(--accent)' : 'var(--bg-tertiary)',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{
                position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%',
                background: 'white', transition: 'left 0.2s',
                left: blockRemoteImages ? 18 : 2,
              }} />
            </MaterialButton>
          </div>

          {/* Search all folders */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 16px', cursor: 'default',
          }}>
            <span style={{ color: 'var(--text-tertiary)', display: 'flex', flexShrink: 0 }}>
              <MaterialIcon name="folder" />
            </span>
            <span style={{ flex: 1, fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--text-primary)' }}>{t('sidebar.searchAllFolders')}</span>
            <MaterialButton aria-label={t('sidebar.searchAllFolders')} aria-checked={searchAllFolders} role="switch" variant="switch" selected={searchAllFolders}
              onClick={() => setSearchAllFolders(!searchAllFolders)}
              style={{
                width: 36, height: 20, borderRadius: 'var(--md-sys-shape-corner-medium)', border: 'none', cursor: 'pointer',
                background: searchAllFolders ? 'var(--accent)' : 'var(--bg-tertiary)',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{
                position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%',
                background: 'white', transition: 'left 0.2s',
                left: searchAllFolders ? 18 : 2,
              }} />
            </MaterialButton>
          </div>

          {/* Edit Profile */}
          <MaterialButton variant="navigation" type="button"
            onClick={() => { setShowProfile(true); setMobileSidebarOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 14px', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ color: 'var(--text-tertiary)', display: 'flex', flexShrink: 0 }}>
              <MaterialIcon name="person" />
            </span>
            <span style={{ flex: 1, fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--text-primary)' }}>{t('profile.editProfile')}</span>
          </MaterialButton>

          {/* Settings */}
          <MaterialButton variant="navigation" type="button"
            onClick={() => { setAdminTab('accounts'); setShowAdmin(true); setMobileSidebarOpen(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 14px', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ color: 'var(--text-tertiary)', display: 'flex', flexShrink: 0 }}>
              <MaterialIcon name="settings" />
            </span>
            <span style={{ flex: 1, fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--text-primary)' }}>{t('sidebar.settings')}</span>
            <MaterialIcon name="chevron_right" />
          </MaterialButton>

          {/* Update available (#261) */}
          {updateInfo?.updateAvailable && (
            <MaterialButton variant="navigation" type="button"
              onClick={() => { setMobileSidebarOpen(false); window.open(updateInfo.url, '_blank', 'noopener'); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
            >
              <span style={{ color: 'var(--accent)', display: 'flex', flexShrink: 0 }}>
                <MaterialIcon name="download" />
              </span>
              <span style={{ flex: 1, fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--accent)' }}>{t('sidebar.updateAvailable', { version: updateInfo.latest })}</span>
            </MaterialButton>
          )}

          {/* Lock */}
          {user?.hasLockPin && (
            <MaterialButton variant="navigation" type="button"
              onClick={() => { setMobileSidebarOpen(false); lockScreen(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ color: 'var(--text-tertiary)', display: 'flex', flexShrink: 0 }}>
                <MaterialIcon name="lock" />
              </span>
              <span style={{ flex: 1, fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--text-primary)' }}>{t('sidebar.lock')}</span>
            </MaterialButton>
          )}

          {/* Sign out */}
          <MaterialButton variant="navigation" type="button"
            onClick={() => signOut()}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              paddingTop: 8, paddingLeft: 14, paddingRight: 14,
              paddingBottom: 'calc(var(--sab) + 12px)', cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ color: 'var(--red, #f87171)', display: 'flex', flexShrink: 0 }}>
              <MaterialIcon name="logout" />
            </span>
            <span style={{ flex: 1, fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--red, #f87171)' }}>{t('sidebar.signOut')}</span>
          </MaterialButton>
          </>
          )}
        </div>
      ) : (
        <>
          <div style={{ padding: '16px 8px 8px' }}>
          <MaterialButton variant="navigation" type="button" aria-haspopup="dialog" aria-expanded={userMenuOpen}
            ref={userMenuBtnRef}
            onClick={openUserMenu}
            style={{
              display: 'flex', alignItems: 'center',
              gap: 8, padding: sidebarCollapsed ? '7px' : '7px 10px',
              borderRadius: 'var(--md-sys-shape-corner-small)', cursor: 'pointer',
              background: userMenuOpen ? 'var(--bg-hover)' : 'transparent',
              transition: 'background 0.1s',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            }}
            
            
          >
            {user?.avatar ? (
              <img src={user.avatar} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'var(--md-sys-typescale-body-small-size)', fontWeight: 700, color: 'var(--accent-text)',
              }}>
                {((user?.displayName || user?.username || '?')[0]).toUpperCase()}
              </div>
            )}
            {!sidebarCollapsed && (
              <>
                <span style={{
                  flex: 1, fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 500,
                  color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {user?.displayName || user?.username || 'Account'}
                </span>
                <MaterialIcon name="expand_more" />
              </>
            )}
          </MaterialButton>
        </div>
        </>
      )}

      {/* User menu — desktop popover */}
      {userMenuOpen && !isMobile && (
        <div
          ref={userMenuPopoverRef} role="dialog" aria-modal="true" aria-label={t('sidebar.settings')}
          style={{
            position: 'fixed',
            bottom: descale(userMenuPos.bottom, uiScale),
            left: descale(userMenuPos.left, uiScale),
            width: 230,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--md-sys-shape-corner-medium)',
            zIndex: 4000,
            boxShadow: 'var(--shadow-modal)',
            overflow: 'hidden',
            animation: 'popover-in var(--motion-fast) var(--ease-emphasized) both',
          }}
        >
          <div style={{ padding: '10px 13px 9px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 600, color: 'var(--text-primary)' }}>
              {user?.displayName || user?.username || 'Account'}
            </div>
            {user?.email && (
              <div style={{
                fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {user.email}
              </div>
            )}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 13px', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}>
                <MaterialIcon name="shield" />
              </span>
              <span style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--text-primary)' }}>{t('sidebar.blockImages')}</span>
            </div>
            <MaterialButton variant="switch" selected={blockRemoteImages} role="switch" aria-checked={blockRemoteImages} aria-label={t('sidebar.blockImages')}
              onClick={async () => {
                try { await setBlockRemoteImages(!blockRemoteImages); }
                catch { addNotification({ title: t('message.whitelistFail.title') }); }
              }}
              style={{
                width: 36, height: 20, borderRadius: 'var(--md-sys-shape-corner-medium)', border: 'none', cursor: 'pointer',
                background: blockRemoteImages ? 'var(--accent)' : 'var(--bg-tertiary)',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0,
              }}
            >
              <span style={{
                position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%',
                background: 'white', transition: 'left 0.2s',
                left: blockRemoteImages ? 18 : 2,
              }} />
            </MaterialButton>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 13px', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}>
                <MaterialIcon name="folder" />
              </span>
              <span style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--text-primary)' }}>{t('sidebar.searchAllFolders')}</span>
            </div>
            <MaterialButton variant="switch" selected={searchAllFolders} role="switch" aria-checked={searchAllFolders} aria-label={t('sidebar.searchAllFolders')}
              onClick={() => setSearchAllFolders(!searchAllFolders)}
              style={{
                width: 36, height: 20, borderRadius: 'var(--md-sys-shape-corner-medium)', border: 'none', cursor: 'pointer',
                background: searchAllFolders ? 'var(--accent)' : 'var(--bg-tertiary)',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0,
              }}
            >
              <span style={{
                position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%',
                background: 'white', transition: 'left 0.2s',
                left: searchAllFolders ? 18 : 2,
              }} />
            </MaterialButton>
          </div>
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '2px 0' }} />
          {updateInfo?.updateAvailable && (
            <>
              <CtxMenuItem menu={false}
                icon={<MaterialIcon name="download" />}
                label={t('sidebar.updateAvailable', { version: updateInfo.latest })}
                onClick={() => { setUserMenuOpen(false); window.open(updateInfo.url, '_blank', 'noopener'); }}
              />
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: '2px 0' }} />
            </>
          )}
          <CtxMenuItem menu={false} icon={<MaterialIcon name="person" />} label={t('profile.editProfile')}
            onClick={() => { setUserMenuOpen(false); setShowProfile(true); }} />
          <CtxMenuItem menu={false} icon={ICONS.settings} label={t('sidebar.settings')}
            onClick={() => { setAdminTab('accounts'); setShowAdmin(true); setUserMenuOpen(false); }} />
          {user?.hasLockPin && (
            <CtxMenuItem menu={false}
              icon={<MaterialIcon name="lock" />}
              label={t('sidebar.lock')}
              onClick={() => { setUserMenuOpen(false); lockScreen(); }}
            />
          )}
          <CtxMenuItem menu={false} icon={ICONS.logout} label={t('sidebar.signOut')} danger
            onClick={() => { setUserMenuOpen(false); signOut(); }} />
        </div>
      )}


      {/* Context menus */}
      {folderCtxMenu && (
        <SidebarCtxMenu
          x={folderCtxMenu.x}
          y={folderCtxMenu.y}
          title={folderCtxMenu.folderObj.name}
          subtitle={folderCtxMenu.folderObj.path}
          items={buildFolderMenuItems(folderCtxMenu.accountId, folderCtxMenu.folderObj)}
          onClose={() => setFolderCtxMenu(null)}
        />
      )}
      {accountCtxMenu && (
        <SidebarCtxMenu
          x={accountCtxMenu.x}
          y={accountCtxMenu.y}
          title={accountCtxMenu.account.name}
          subtitle={accountCtxMenu.account.email_address}
          items={buildAccountMenuItems(accountCtxMenu.account)}
          onClose={() => setAccountCtxMenu(null)}
        />
      )}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}

      {confirmDialog && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }} onClick={() => setConfirmDialog(null)}>
          <MaterialDialog aria-label={confirmDialog.message} role="alertdialog" onClose={() => setConfirmDialog(null)} style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--md-sys-shape-corner-medium)', padding: '24px 24px 20px', maxWidth: 360, width: '100%',
            boxShadow: 'var(--shadow-modal)',
          }} onClick={e => e.stopPropagation()}>
            {confirmDialog.account && (
              <p style={{ margin: '0 0 6px', fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-secondary)' }}>
                {confirmDialog.account}
              </p>
            )}
            <p style={{ margin: '0 0 20px', fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              {confirmDialog.message}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <MaterialButton variant="outlined" onClick={() => setConfirmDialog(null)} className="btn-press" style={{
                padding: '7px 16px', borderRadius: 'var(--md-sys-shape-corner-small)', border: '1px solid var(--border-subtle)',
                background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 'var(--md-sys-typescale-body-medium-size)',
              }}>{t('common.cancel')}</MaterialButton>
              <MaterialButton variant="text" onClick={() => { const fn = confirmDialog.onConfirm; setConfirmDialog(null); fn(); }} className="btn-press" style={{
                padding: '7px 16px', borderRadius: 'var(--md-sys-shape-corner-small)', border: 'none',
                background: 'var(--red)', color: 'white', cursor: 'pointer', fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 500,
              }}>{t('common.delete')}</MaterialButton>
            </div>
          </MaterialDialog>
        </div>
      )}

    </div>
  );
}

// `alert` (the Scheduled entry's "2 need attention") adds a red dot and is said with the label.
function NavItem({ icon, label, active, collapsed, badge, badgeStale = false, badgeTitle, alert = null, onClick, mailboxRow = false }) {
  const navBadge = unreadBadge({ count: badge, stale: badgeStale, max: 999 });
  // The name says what the badge and the dot show: "Scheduled, Waiting to be sent: 1, Need
  // attention: 3". Only an entry with its own badge title (Scheduled) names its count.
  const parts = [label, badgeTitle && navBadge ? badgeTitle : null, alert].filter(Boolean);
  const name = parts.length > 1 ? parts.join(', ') : null;
  return (
    <div data-md-state=""
      data-mailbox-row={mailboxRow ? '' : undefined}
      className={active ? 'nav-item nav-item-active' : 'nav-item'}
      onClick={onClick}
      onKeyDown={activateOnKey(onClick)}
      role="button"
      tabIndex={0}
      title={name || collapsedTooltip(label, collapsed)}
      aria-label={name || collapsedTooltip(label, collapsed)}
      style={{
        display: 'flex', alignItems: 'center',
        gap: 8, padding: collapsed ? '9px' : '8px 10px',
        borderRadius: 'var(--md-sys-shape-corner-small)', cursor: 'pointer',
        background: active ? 'var(--bg-hover)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        transition: 'background 0.1s, color 0.1s',
        justifyContent: collapsed ? 'center' : 'flex-start',
        position: 'relative',
      }}
      
      
    >
      <span style={{ flexShrink: 0 }}>{icon}</span>
      {!collapsed && (
        <>
          <span style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: active ? 500 : 400, flex: 1 }}>{label}</span>
          {alert && (
            <span data-nav-alert="" aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', flexShrink: 0 }} />
          )}
          {navBadge && (
            <span title={badgeTitle || navBadge.title} style={{
              fontSize: 'var(--md-sys-typescale-body-small-size)', fontWeight: 600, color: 'var(--accent-text)',
              background: 'var(--accent)', padding: '1px 7px',
              borderRadius: 'var(--md-sys-shape-corner-medium)', minWidth: 20, textAlign: 'center',
            }}>
              {navBadge.text}
            </span>
          )}
        </>
      )}
      {collapsed && (navBadge || alert) && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
          width: 7, height: 7, borderRadius: '50%',
          background: alert ? 'var(--red)' : 'var(--accent)',
        }} />
      )}
    </div>
  );
}
