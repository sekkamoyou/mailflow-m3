import { descaleCss } from '../utils/uiScaleCss.js';
import { MaterialProgress } from '../material/controls.jsx';
import { MaterialIcon } from '../material/controls.jsx';
import MaterialNavigation from '../material/Navigation.jsx';
import PaneResizeHandle from '../material/PaneResizeHandle.jsx';
import { useModalFocus } from '../material/useModalFocus.js';
import { MaterialButton } from '../material/controls.jsx';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { REPAIR_FLAG, signInResultNotice, trustedWrongAccount } from '../utils/accountErrors.js';
import InboxReplyDraftObserver from './InboxReplyDraftObserver.js';
import { useStore } from '../store/index.js';
import { api, setPageClosing } from '../utils/api.js';
import { flushUndoables } from '../utils/undoableAction.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { useMobile } from '../hooks/useMobile.js';
import { LAYOUTS } from '../layouts.js';
import { closeOpenMessage } from '../utils/closeMessage.js';
import { updateFaviconBadge } from '../themes.js';
import { installResumeRefresh } from '../utils/resumeRefresh.js';
import { shortcutBus } from '../utils/shortcutBus.js';
import { dispatchHoveredGtdShortcut } from '../utils/gtdHoveredRow.js';
import { runMailboxShortcut, canRunMailboxShortcut, browserShortcutFallback } from '../utils/visibleMailboxes.js';
import { canRunSelectedAction, canRunGlobalAction } from '../utils/shortcutApplicability.js';
import { selectedPickerMessage } from '../utils/labelPicker.js';
import { applyMarkRead } from '../utils/markRead.js';
import { buildKeyMap, resolveShortcutAction, shortcutActionText, getEffectiveShortcuts, getGroupedActions, parseModKey, modLabel, SPECIAL_KEYS, SPECIAL_KEY_LABELS } from '../utils/defaultShortcuts.js';
import Sidebar from './Sidebar.jsx';
import LogoMark from './LogoMark.jsx';
import MessageList from './MessageList.jsx';
import ReadingPane from './ReadingPane.jsx';
import NotificationToasts from './NotificationToasts.jsx';
import CommandPalette from './CommandPalette.jsx';
import BusinessNotice from './BusinessNotice.jsx';
import { usePluginSlot, PluginRuntime } from '../plugins/PluginSlot.jsx';
import { takePendingDeepLink, watchPendingDeepLink } from '../utils/pendingDeepLink.js';
import { scheduledFeed } from '../utils/scheduledFeed.js';
import { noticeToast, scheduledLinkId } from '../utils/scheduledView.js';
import { openScheduledView, SCHEDULED_VIEW } from '../utils/scheduledCompose.js';
import { openSentMessage } from '../utils/openSentMessage.js';

// Opens the Scheduled view at one message, highlighted (a notification link or a toast's Open).
function openScheduledMessage(id) {
  openScheduledView(useStore, id);
}

const ContactsPage = lazy(() => import('./ContactsPage.jsx'));
const WindowLayer  = lazy(() => import('./WindowLayer.jsx'));

const ComposeModal = lazy(() => import('./ComposeModal.jsx'));
const AdminPanel   = lazy(() => import('./AdminPanel.jsx'));
const ElectronNotificationBridge = lazy(() => import('./ElectronNotificationBridge.jsx'));

const lazyFallback = (
  <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
    <MaterialProgress small />
  </div>
);

// Waits before each new try of a failed account load: quick for a server that is restarting,
// then once a minute.
const ACCOUNTS_RETRY_MS = [2000, 5000, 15000, 30000, 60000];

export default function MailApp() {
  const appDisplayName = useStore(state => state.appDisplayName);
  const { t } = useTranslation();
  const {
    setAccounts, setUnreadCounts, showAdmin,
    setShowAdmin, setAdminTab, composing, composeSession, sidebarCollapsed, layout,
    unreadCounts, selectedAccountId, selectedFolder, openCompose, setSelectedAccount,
    shortcuts, selectedMessageId, setSelectedMessage,
    mobileSidebarOpen, setMobileSidebarOpen, mobileSearchOpen, setMobileSearchOpen, addNotification,
    fontSize, showAppBadge, showFaviconBadge,
    sidebarWidth, setSidebarWidth, setIsSidebarResizing, toggleSidebar,
    showContacts, setTodoistConnected,
    accounts, rightSidebarWidth, setRightSidebarWidth, isRightSidebarResizing, setIsRightSidebarResizing,
    rightSidebarHidden, toggleRightSidebarHidden,
  } = useStore();
  const [searchHost, setSearchHost] = useState(null);
  const workspaceRef = useRef(null);
  const previousContacts = useRef(showContacts);
  const syncInterval = useStore(s => s.syncInterval);
  const autoLockMinutes = useStore(s => s.autoLockMinutes);
  const lockScreen = useStore(s => s.lockScreen);

  // An archive, move or other action still in its undo window goes to the server when the tab
  // closes or reloads (keepalive, so the request outlives the page), and before the screen locks,
  // rather than never. pageshow undoes the flag for a page restored from the back-forward cache.
  useEffect(() => {
    // A page kept in the back-forward cache comes back with the Undo toasts of the actions just
    // sent; their Undo refuses (releaseUndoable says they are no longer pending).
    const onHide = () => { setPageClosing(true); flushUndoables(); };
    const onShow = () => setPageClosing(false);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    window.addEventListener('mailflow:will-lock', flushUndoables);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
      window.removeEventListener('mailflow:will-lock', flushUndoables);
    };
  }, []);

  // Auto-lock after inactivity (#235). MailApp only mounts while unlocked, so this
  // timer runs only when unlocked; hitting the timeout locks and unmounts this tree.
  useEffect(() => {
    if (!autoLockMinutes) return undefined;
    const ms = autoLockMinutes * 60 * 1000;
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const maybeLock = () => { if (Date.now() - last >= ms) lockScreen(); };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
    events.forEach(e => window.addEventListener(e, bump, { passive: true }));
    // Poll + check on refocus rather than a single setTimeout: a lone timeout gets
    // throttled/frozen in a backgrounded tab, so an idle session might never fire.
    // Comparing timestamps every 15s (and on visibilitychange) locks reliably and
    // catches up when the tab is brought back to the foreground.
    document.addEventListener('visibilitychange', maybeLock);
    const iv = setInterval(maybeLock, 15000);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', maybeLock);
      events.forEach(e => window.removeEventListener(e, bump));
    };
  }, [autoLockMinutes, lockScreen]);

  const scale = fontSize / 100;
  const hasNativeBridge = Boolean(window.mailflowNative || window.Capacitor?.isNativePlatform?.());

  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [labelPickerMessage, setLabelPickerMessage] = useState(null);
  const labelPickerRef = useRef(null);
  useEffect(() => { labelPickerRef.current = labelPickerMessage; }, [labelPickerMessage]);
  const isMobile = useMobile();
  const [overlayDrawer, setOverlayDrawer] = useState(() => window.innerWidth < 1200);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1199px)');
    const update = event => setOverlayDrawer(event.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const drawerRef = useModalFocus({ enabled: mobileSidebarOpen && overlayDrawer, onEscape: () => setMobileSidebarOpen(false) });
  useEffect(() => {
    const changed = previousContacts.current !== showContacts;
    previousContacts.current = showContacts;
    if (!isMobile || !changed) return;
    const frame = requestAnimationFrame(() => {
      const target = [...(workspaceRef.current?.querySelectorAll('button') || [])].find(button =>
        !button.disabled && !button.closest('.material-navigation, [inert], [aria-hidden="true"]') && button.getClientRects().length);
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [showContacts, isMobile]);
  const sidebarDragRef = useRef(null);

  // Keep the right sidebar's width CSS var in sync with the persisted preference.
  useEffect(() => {
    document.documentElement.style.setProperty('--right-sidebar-width', rightSidebarWidth + 'px');
  }, [rightSidebarWidth]);

  const currentLayout = LAYOUTS[layout] || LAYOUTS.comfortable;
  // List first (#596): on a desktop the list or the open message fills the content area and Back
  // returns to the list, as on a phone.
  const listFirst = !isMobile && Boolean(currentLayout.listFirst);
  const singleView = isMobile || listFirst;
  const scheduledView = selectedAccountId === null && selectedFolder === SCHEDULED_VIEW;
  const previousMessage = useRef(selectedMessageId);
  useLayoutEffect(() => {
    const previous = previousMessage.current;
    previousMessage.current = selectedMessageId;
    if (!singleView || showContacts || previous === selectedMessageId) return;
    const workspace = workspaceRef.current;
    if (!previous && selectedMessageId) {
      workspace?.querySelector('[data-reader-back]')?.focus({ preventScroll: true });
    } else if (previous && !selectedMessageId) {
      const row = Array.from(workspace?.querySelectorAll('[data-message-open]') || [])
        .find(button => button.dataset.messageOpen === String(previous) && button.getClientRects().length);
      if (row) row.focus();
      else workspace?.querySelector('.md-message-list-scroll')?.focus({ preventScroll: true });
    }
  }, [selectedMessageId, showContacts, singleView]);

  // Shortcut hint (e.g. "⌘/") for the collapse/expand tooltips, derived from the
  // live shortcut map via the existing helpers — no new plumbing. '' when unbound.
  const rightSidebarToggleParsed = parseModKey(getEffectiveShortcuts(shortcuts).toggleRightSidebar);
  const rightSidebarToggleHint = rightSidebarToggleParsed ? `${modLabel(rightSidebarToggleParsed.mod)}${rightSidebarToggleParsed.bare}` : '';
  // The right sidebar renders when a plugin supplies content for the 'right-sidebar' slot. Core is
  // plugin-agnostic here — it places the seam; a plugin (currently GTD) fills it. The layout/shortcut
  // infrastructure below keys off whether any content exists, not off any specific feature.
  const mailContentRef = useRef(null);
  const [rightSidebarFits, setRightSidebarFits] = useState(false);
  const [rightSidebarOverlayOpen, setRightSidebarOverlayOpen] = useState(false);
  const toggleVisibleRightSidebar = useCallback(() => {
    if (rightSidebarFits) toggleRightSidebarHidden();
    else setRightSidebarOverlayOpen(open => !open);
  }, [rightSidebarFits, toggleRightSidebarHidden]);
  const rightSidebarCollapsed = rightSidebarFits ? rightSidebarHidden : !rightSidebarOverlayOpen;
  const sidebarOverlay = !rightSidebarFits && rightSidebarOverlayOpen;
  const sidebarDialogRef = useModalFocus({ enabled: sidebarOverlay, onEscape: () => setRightSidebarOverlayOpen(false) });
  useLayoutEffect(() => {
    const content = mailContentRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return;
    const list = content.querySelector('#material-mail-list');
    const measure = () => {
      if (!content.clientWidth) return;
      const available = content.clientWidth - (listFirst ? 0 : list?.offsetWidth || 0);
      setRightSidebarFits(available - rightSidebarWidth - 2 >= 320);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    if (list) observer.observe(list);
    return () => observer.disconnect();
  }, [isMobile, currentLayout.direction, listFirst, rightSidebarWidth, showContacts, scheduledView]);
  useEffect(() => { setRightSidebarOverlayOpen(false); }, [rightSidebarFits]);
  const rightSidebarCtx = { accounts, selectedAccountId, onCollapse: toggleVisibleRightSidebar, toggleHint: rightSidebarToggleHint };
  const rightSidebarProviders = usePluginSlot('right-sidebar', rightSidebarCtx);
  const rightSidebarContent = rightSidebarProviders.length ? rightSidebarProviders[0].render(rightSidebarCtx) : null;
  const rightSidebarApplicable = !isMobile && currentLayout.direction === 'row' && rightSidebarContent != null;
  const rightPanePinned = rightSidebarApplicable && !rightSidebarCollapsed && !sidebarOverlay;
  // Reserve the reader, the divider and any right sidebar controls in the same row.
  const listResizeReserve = rightPanePinned ? 322 + rightSidebarWidth
    : rightSidebarApplicable && rightSidebarCollapsed ? 369 : 321;

  // Push a history entry when an email is opened on mobile so that the browser's
  // native back gesture (iOS swipe, Android back button) pops an in-app state
  // instead of leaving MailFlow entirely.
  const prevMessageIdRef = useRef(selectedMessageId);
  const selectedMessageIdRef = useRef(selectedMessageId);
  useEffect(() => { selectedMessageIdRef.current = selectedMessageId; }, [selectedMessageId]);

  useEffect(() => {
    if (isMobile && mobileSearchOpen && !selectedMessageIdRef.current && window.history.state?.mailflow !== 'search') {
      window.history.pushState({ mailflow: 'search' }, '');
    }
  }, [isMobile, mobileSearchOpen]);

  useEffect(() => {
    const prev = prevMessageIdRef.current;
    prevMessageIdRef.current = selectedMessageId;
    if (!singleView) return;
    if (selectedMessageId && !prev) {
      history.pushState({ mailflow: 'message' }, '', '/');
    }
  }, [singleView, selectedMessageId]);

  useEffect(() => {
    if (!singleView) return;
    // In standalone PWA mode (iOS home-screen install), push a guard entry on
    // startup so there is always at least one history entry above the baseline.
    // The handler re-pushes it after every popstate so back swipes always land
    // inside the app rather than exiting the PWA and showing a blank Safari page.
    if (window.navigator.standalone && !['guard', 'search', 'message'].includes(history.state?.mailflow)) {
      history.pushState({ mailflow: 'guard' }, '', '/');
    }
    const handler = (event) => {
      if (selectedMessageIdRef.current) setSelectedMessage(null);
      else if (useStore.getState().mobileSearchOpen) setMobileSearchOpen(false);
      // Backing out of a message lands on the existing guard entry. Re-pushing
      // during that popstate can make iOS PWA history gestures temporarily stop
      // delivering taps, so only re-arm when the user has backed past the guard.
      if (window.navigator.standalone && !['guard', 'search'].includes(event.state?.mailflow)) {
        history.pushState({ mailflow: 'guard' }, '', '/');
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [singleView, setSelectedMessage, setMobileSearchOpen]);

  // Escape in a single-pane reader goes back to the list, unless a menu or dialog is open
  // (its own Escape closes it).
  useEffect(() => {
    if (!singleView) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !selectedMessageIdRef.current) return;
      if (composingRef.current || showAdminRef.current || paletteOpenRef.current) return;
      if (document.querySelector('[role="menu"], [role="dialog"], [role="listbox"]')) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
      closeOpenMessage();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [singleView]);

  const wsRef = useWebSocket();

  // Scheduled messages (#543, design 5.3): the list and counts follow scheduled_changed, and a
  // message the sender sent, failed or paused is told in a toast, with View or Open.
  useEffect(() => scheduledFeed.start({
    onNotices: (notices) => {
      for (const notice of notices) {
        useStore.getState().addNotification(noticeToast(notice, {
          t,
          openView: openScheduledMessage,
          openSent: row => openSentMessage(useStore, { accountId: row.accountId, folder: row.result.sentFolder, messageId: row.result.messageId }),
        }));
      }
    },
  }), [t]);

  // Open a specific message by id (fetch → cache → select). Shared by the on-load
  // deep-link path and the service-worker notification-tap path so both behave
  // identically.
  const openDeepLinkMessage = useCallback((id) => {
    // resolveMessage matches the stable Message-ID header first, then the UUID — so a link
    // still opens after the email was moved to another folder (#270). Legacy/notification
    // links carry the UUID and resolve via the fallback.
    return api.resolveMessage(id)
      .then(msg => {
        // threadMessages is not cleared by setMessages(), so storing the message
        // here keeps it available to MessagePane even after the message list loads
        // a different folder's page (which would evict it from the main array).
        useStore.getState().setThreadMessages(`__dl_${msg.id}`, [msg]);
        setSelectedMessage(msg.id);
        // The deep-link opens the message directly, bypassing the list/pane
        // selectAndMarkRead — so mark it read here too. Mirrors that logic exactly,
        // including the pending-read guard that stops a concurrent sync from
        // reverting the optimistic flag. Respects the user's manual-mark preference.
        // A deep-link is an explicit open, so it marks read immediately rather than
        // honoring markReadDelay, but it still respects the manual preference.
        if (useStore.getState().markReadBehavior === 'manual') return;
        applyMarkRead(msg);
      })
      .catch(err => console.warn('Deep link message not found:', err.message));
  }, [setSelectedMessage]);

  // Consume the deep-link the SW persisted on a notification tap: read+clear it,
  // then open the message. IndexedDB is the reliable channel on iOS (postMessage can
  // be missed on a focus-with-reload, openWindow's URL is ignored on cold launch).
  const openPendingDeepLink = useCallback((url) => {
    // A scheduled message's push (#543, design 5.3) opens the Scheduled view at that message.
    const scheduledId = scheduledLinkId(url, window.location.origin);
    if (scheduledId) { openScheduledMessage(scheduledId); return; }
    try {
      const id = new URL(url, window.location.origin).searchParams.get('m');
      if (id) openDeepLinkMessage(id);
    } catch { /* ignore a malformed persisted deep-link */ }
  }, [openDeepLinkMessage]);
  const consumePendingDeepLink = useCallback(() => {
    takePendingDeepLink().then((url) => { if (url) openPendingDeepLink(url); });
  }, [openPendingDeepLink]);

  // On load: open a deep-linked message from ?m= (Chromium honors openWindow) or a
  // stored id, plus any target the SW persisted for a notification tap.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scheduledId = scheduledLinkId(window.location.href);
    if (scheduledId) {
      history.replaceState(null, '', window.location.pathname);
      openScheduledMessage(scheduledId);
    }
    const deepLinkId = params.get('m') || sessionStorage.getItem('mailflow_deep_link_id');
    if (deepLinkId) {
      sessionStorage.removeItem('mailflow_deep_link_id');
      history.replaceState(null, '', window.location.pathname);
      openDeepLinkMessage(deepLinkId);
    }
    consumePendingDeepLink();
  }, [openDeepLinkMessage, consumePendingDeepLink]);

  // A notification tap that returns to a backgrounded app (the achievable iOS case)
  // fires visibilitychange; the SW also nudges via postMessage. Both consume the
  // persisted target — read+clear is atomic, so whichever runs first wins. iOS can bring
  // the app forward before the SW has stored the target, so coming to the front keeps
  // checking for a few seconds (watchPendingDeepLink, #589).
  useEffect(() => {
    let stopWatch = null;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      stopWatch?.();
      stopWatch = watchPendingDeepLink({ open: openPendingDeepLink });
    };
    document.addEventListener('visibilitychange', onVisible);
    let onSwMessage;
    if ('serviceWorker' in navigator) {
      onSwMessage = (event) => {
        if (event.data && event.data.type === 'mailflow_deeplink') consumePendingDeepLink();
      };
      navigator.serviceWorker.addEventListener('message', onSwMessage);
    }
    return () => {
      stopWatch?.();
      document.removeEventListener('visibilitychange', onVisible);
      if (onSwMessage) navigator.serviceWorker.removeEventListener('message', onSwMessage);
    };
  }, [consumePendingDeepLink, openPendingDeepLink]);

  // PWA mailto: handler (manifest protocol_handlers → /?mailto=<encoded mailto: URL>).
  // Parse the mailto and open a pre-filled compose window. Runs once on mount; a no-op
  // for a normal launch since the param is absent.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('mailto');
    if (!raw) return;
    // Strip only the mailto param first so a refresh doesn't reopen compose.
    const loc = new URL(window.location.href);
    loc.searchParams.delete('mailto');
    history.replaceState(null, '', loc.pathname + loc.search);
    try {
      const mt = new URL(raw);
      if (mt.protocol !== 'mailto:') return;
      const safeDecode = (x) => { try { return decodeURIComponent(x); } catch { return x; } };
      // pathname addresses are raw-encoded; searchParams values are already decoded.
      const splitAddrs = (s, decode) => !s ? [] : s.split(',').map(a => decode ? safeDecode(a.trim()) : a.trim()).filter(Boolean);
      const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      // A mailto body is plain text (RFC 6068); escape it so it renders literally in
      // the HTML editor and can't inject markup.
      const bodyText = mt.searchParams.get('body') || '';
      openCompose({
        to: [...splitAddrs(mt.pathname, true), ...splitAddrs(mt.searchParams.get('to'), false)],
        cc: splitAddrs(mt.searchParams.get('cc'), false),
        bcc: splitAddrs(mt.searchParams.get('bcc'), false),
        subject: mt.searchParams.get('subject') || '',
        body: bodyText ? esc(bodyText).replace(/\r?\n/g, '<br>') : '',
      });
    } catch (err) {
      console.warn('Invalid mailto link:', err.message);
    }
  }, [openCompose]);

  useEffect(() => {
    // Load accounts. A failed load (the server restarting, a dropped connection) used to leave
    // the app with no accounts until a reload: it is tried again, sooner at first, and on a resume.
    let active = true;
    let accountsLoaded = false;
    let accountsRetry = null;
    let accountsAttempt = 0;
    const loadAccounts = () => {
      clearTimeout(accountsRetry);
      return api.getAccounts()
        .then(accounts => {
          if (!active) return;
          accountsLoaded = true;
          setAccounts(accounts); // also sets accountsReady:true in the store
        })
        .catch(err => {
          if (!active) return;
          console.error(err);
          // Even on error, mark accounts as ready so MessageList doesn't hang
          useStore.setState({ accountsReady: true });
          if (err?.status === 401) return; // signed out: the session handler takes over
          const delay = ACCOUNTS_RETRY_MS[Math.min(accountsAttempt++, ACCOUNTS_RETRY_MS.length - 1)];
          accountsRetry = setTimeout(loadAccounts, delay);
        });
    };
    loadAccounts();

    // Sync Todoist connection state — localStorage alone isn't enough across devices/sessions
    api.todoist.status().then(({ connected }) => setTodoistConnected(connected)).catch(() => {});

    // Preload ComposeModal chunk so first open is instant
    import('./ComposeModal.jsx');

    // Load unread counts
    const refreshCounts = () => {
      api.getUnreadCounts()
        .then(setUnreadCounts)
        .catch(console.error);
    };
    const refreshFolders = () => {
      const state = useStore.getState();
      for (const accountId of Object.keys(state.folders)) {
        api.getFolders(accountId).then(f => useStore.getState().setFolders(accountId, f)).catch(() => {});
      }
    };
    refreshCounts();
    // Also expire stale indicators when the socket is unavailable.
    const interval = setInterval(() => { refreshCounts(); refreshFolders(); }, 60000);

    // Resynchronise the moment the tab comes back, rather than waiting for a timer that was
    // frozen while it was away. Without this the LIST can show a pre-sleep snapshot while the
    // counts, which are polled and pushed from more places, are already current — so the badge
    // says 2 and the list shows nothing unread, which reads as the unread count lying.
    //
    // This deliberately reuses mailflow:refresh, the signal the socket-down fallback already
    // dispatches and MessageList already listens for, instead of adding a second reload path.
    // What counts as a resume, and collapsing the burst of signals one resume produces, lives
    // in utils/resumeRefresh.js with its tests.
    const stopResume = installResumeRefresh({
      doc: document, win: window,
      shouldSkip: () => useStore.getState().isLocked,
      // The counts request stands for the whole resync: the list reload and the folder requests
      // fail on their own without saying so, and when the network is not back yet, all of them
      // do. Its failure has installResumeRefresh run the resync again.
      onResync: () => {
        if (!accountsLoaded) loadAccounts();
        refreshFolders();
        window.dispatchEvent(new CustomEvent('mailflow:refresh'));
        return api.getUnreadCounts().then(setUnreadCounts);
      },
    });

    window.addEventListener('mailflow:counts_refresh', refreshCounts);
    return () => {
      active = false;
      clearInterval(interval);
      clearTimeout(accountsRetry);
      stopResume();
      window.removeEventListener('mailflow:counts_refresh', refreshCounts);
    };
  }, [setAccounts, setUnreadCounts, setTodoistConnected]);

  // WebSocket-independent periodic refresh of the open message list, at the user's chosen sync
  // interval. Only fires when the tab is visible AND the socket is not OPEN — a true fallback so
  // read state and new mail still converge if the WebSocket is down, without redundant refetching
  // while it's healthy (the socket delivers updates instantly in that case).
  useEffect(() => {
    const ms = Math.max(15, syncInterval || 60) * 1000;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible' && wsRef.current?.readyState !== WebSocket.OPEN) {
        window.dispatchEvent(new CustomEvent('mailflow:refresh'));
      }
    }, ms);
    return () => clearInterval(id);
  }, [syncInterval, wsRef]);

  // Update browser tab title, favicon badge, and PWA home screen badge with unread count
  useEffect(() => {
    const total = unreadCounts.total;
    const tabCount = selectedAccountId
      ? (unreadCounts.byAccount[selectedAccountId] ?? 0)
      : total;
    updateFaviconBadge(showFaviconBadge ? tabCount : 0);
    // App-icon badge always reflects total unread across all accounts so that
    // selecting a zero-unread account never clears the home screen badge.
    if ('setAppBadge' in navigator) {
      if (showAppBadge && total > 0) navigator.setAppBadge(total).catch(() => {});
      else navigator.clearAppBadge().catch(() => {});
    }
    window.mailflowNative?.badges?.setUnreadCount?.(total).catch(() => {});
  }, [unreadCounts, selectedAccountId, showAppBadge, showFaviconBadge]);

  // ── Global keyboard shortcut listener ──────────────────────────────────────
  // Uses refs for composing/showAdmin so the listener doesn't need to
  // re-register every time those values change — only re-registers when the
  // user's custom shortcut map changes.
  const composingRef  = useRef(composing);
  const showAdminRef  = useRef(showAdmin);
  useEffect(() => { composingRef.current  = composing;  }, [composing]);
  useEffect(() => { showAdminRef.current  = showAdmin;  }, [showAdmin]);

  const mobileSidebarOpenRef = useRef(mobileSidebarOpen);
  const showShortcutHelpRef = useRef(showShortcutHelp);
  const paletteOpenRef = useRef(paletteOpen);
  useEffect(() => { mobileSidebarOpenRef.current = mobileSidebarOpen; }, [mobileSidebarOpen]);
  useEffect(() => { showShortcutHelpRef.current = showShortcutHelp; }, [showShortcutHelp]);
  useEffect(() => { paletteOpenRef.current = paletteOpen; }, [paletteOpen]);

  useEffect(() => {
    window.__mailflowHandleAndroidBack = () => {
      if (composingRef.current) {
        useStore.getState().closeCompose();
        return true;
      }

      if (showAdminRef.current) {
        setShowAdmin(false);
        return true;
      }

      if (paletteOpenRef.current) {
        setPaletteOpen(false);
        return true;
      }

      if (showShortcutHelpRef.current) {
        setShowShortcutHelp(false);
        return true;
      }

      if (mobileSidebarOpenRef.current) {
        setMobileSidebarOpen(false);
        return true;
      }

      if (selectedMessageIdRef.current) {
        setSelectedMessage(null);
        return true;
      }

      if (useStore.getState().mobileSearchOpen) {
        setMobileSearchOpen(false);
        if (window.history.state?.mailflow === 'search') window.history.back();
        return true;
      }

      return false;
    };

    return () => {
      if (window.__mailflowHandleAndroidBack) delete window.__mailflowHandleAndroidBack;
    };
  }, [setMobileSidebarOpen, setSelectedMessage, setShowAdmin, setMobileSearchOpen]);

  useEffect(() => {
    if (isMobile) return;
    const keyMap    = buildKeyMap(shortcuts);
    // Keys that are prefixes of two-key sequences (e.g. 'g' for 'gi').
    // Special keys like 'Delete' have length > 1 but are single keypresses — exclude them.
    const prefixKeys = new Set(
      [...Object.keys(keyMap).filter(k => k.length > 1 && !SPECIAL_KEYS.has(k)).map(k => k[0]), 'g']
    );

    let pendingKey   = null;
    let pendingTimer = null;

    const clearPending = () => {
      pendingKey = null;
      if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    };

    const canRun = (action) => {
      if (!canRunGlobalAction(action, { rightSidebarApplicable })) return false;
      if (!canRunSelectedAction(action, useStore.getState())) return false;
      if (action === 'toggleLeftSidebar' || /^goVisibleMailbox[1-9]$/.test(action)) {
        return canRunMailboxShortcut(action, document.querySelector('[data-mailbox-sidebar]'));
      }
      return true;
    };

    const dispatchAction = action => {
      if (!dispatchHoveredGtdShortcut(action, useStore.getState())) shortcutBus.emit(action);
    };

    const handler = (e) => {
      // Never intercept when the compose modal or admin panel is open, or an input is focused
      if (composingRef.current || showAdminRef.current || paletteOpenRef.current) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
      // The registry resolves the exact modifier set, including shifted punctuation.
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
        const action = resolveShortcutAction(e, shortcuts);
        if (action && canRun(action)) { e.preventDefault(); dispatchAction(action); }
        return;
      }

      const key = e.key;

      // Pure modifier keys — never intercept
      if (['CapsLock', 'Control', 'Meta', 'Alt', 'Shift'].includes(key)) return;

      // Escape cancels any pending prefix sequence
      if (key === 'Escape') { clearPending(); return; }

      // Resolve two-key sequences
      let resolved = key;
      if (pendingKey !== null) {
        resolved = pendingKey + key;
        clearPending();
      }

      // Check the keymap first — bound actions take priority, including special
      // keys like Delete that would otherwise be skipped below.
      const action = resolved.length > 1 && !SPECIAL_KEYS.has(resolved)
        ? keyMap[resolved] || browserShortcutFallback(resolved) : resolveShortcutAction(e, shortcuts);
      if (action && canRun(action)) {
        e.preventDefault();
        dispatchAction(action);
        return;
      }

      // Skip non-character keys that aren't bound (arrow keys, F-keys, etc.)
      if (['Tab', 'Enter', 'Backspace', 'Delete',
           'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
           'Home', 'End', 'PageUp', 'PageDown', 'Insert',
           'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
           'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].includes(key)) {
        return;
      }

      // Check if this single key could start a two-key sequence
      if (prefixKeys.has(resolved) && resolved.length === 1) {
        e.preventDefault();
        pendingKey   = resolved;
        pendingTimer = setTimeout(clearPending, 1000);
        return;
      }

      // Typed key didn't match anything — clear any stale pending state
      if (pendingKey !== null) clearPending();
    };

    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      clearPending();
    };
  }, [shortcuts, isMobile, rightSidebarApplicable]);

  // Subscribe to global actions that MailApp owns
  useEffect(() => {
    const onCompose   = () => openCompose({});
    const onGoInbox   = () => setSelectedAccount(null, 'INBOX');
    const onShowHelp  = () => { if (!isMobile) setShowShortcutHelp(v => !v); };

    shortcutBus.on('compose',   onCompose);
    shortcutBus.on('goInbox',   onGoInbox);
    shortcutBus.on('showHelp',  onShowHelp);
    return () => {
      shortcutBus.off('compose',   onCompose);
      shortcutBus.off('goInbox',   onGoInbox);
      shortcutBus.off('showHelp',  onShowHelp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Whole right-sidebar collapse toggle (cmd+/). Re-subscribed when applicability
  // flips so the handler never toggles a sidebar that is not rendered.
  useEffect(() => {
    const onToggleRightSidebar = () => { if (rightSidebarApplicable) toggleVisibleRightSidebar(); };
    shortcutBus.on('toggleRightSidebar', onToggleRightSidebar);
    return () => shortcutBus.off('toggleRightSidebar', onToggleRightSidebar);
  }, [rightSidebarApplicable, toggleVisibleRightSidebar]);

  useEffect(() => {
    const openPicker = () => {
      const message = selectedPickerMessage(useStore.getState());
      if (!message) return;
      setLabelPickerMessage(message);
      setPaletteOpen(true);
    };
    shortcutBus.on('openLabelPicker', openPicker);
    return () => shortcutBus.off('openLabelPicker', openPicker);
  }, []);

  useEffect(() => {
    const actions = ['toggleLeftSidebar', ...Array.from({ length: 9 }, (_, i) => `goVisibleMailbox${i + 1}`)];
    const handlers = actions.map(action => {
      const handler = () => runMailboxShortcut(action, useStore.getState(), document.querySelector('[data-mailbox-sidebar]'));
      shortcutBus.on(action, handler);
      return [action, handler];
    });
    return () => handlers.forEach(([action, handler]) => shortcutBus.off(action, handler));
  }, []);

  // Close help overlay on Escape
  useEffect(() => {
    if (!showShortcutHelp) return;
    const handler = (e) => { if (e.key === 'Escape') { e.preventDefault(); setShowShortcutHelp(false); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showShortcutHelp]);

  // Cmd+K / Ctrl+K opens command palette
  useEffect(() => {
    const handler = (e) => {
      if (e.defaultPrevented || composingRef.current || showAdminRef.current || labelPickerRef.current) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable) return;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k'
          && !resolveShortcutAction(e, useStore.getState().shortcuts)) {
        e.preventDefault();
        setPaletteOpen(v => !v);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Handle same-tab OAuth callback redirects (e.g. /?oauth_success=microsoft).
  // The popup case (window.opener present) is handled earlier in App.jsx before
  // auth is checked, so MailApp never mounts in that context.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get('oauth_success');
    const oauthError = params.get('oauth_error');
    const oidcSuccess = params.get('oidc_success');
    const oidcError = params.get('oidc_error');

    if (provider) {
      window.history.replaceState({}, '', '/');
      try { sessionStorage.removeItem(REPAIR_FLAG); } catch { /* storage unavailable */ }
      api.getAccounts()
        .then(accounts => { setAccounts(accounts); })
        .catch(console.error);
      setAdminTab('accounts');
      setShowAdmin(true);
      // How the first connection went, kept in the session by the sign-in: read it (which also
      // clears it) and say so here, since no other tab is waiting for it.
      if (params.get('oauth_result')) {
        api.oauthResult().then((result) => {
          const note = signInResultNotice(result, provider);
          if (note) addNotification({ type: note.type, title: t(note.titleKey, note.values), body: note.bodyKey ? t(note.bodyKey, note.values) : undefined });
        }).catch(() => {});
      }
    } else if (oauthError) {
      // A sign-in that ends in this tab, rather than in the one that started it, says how it went
      // instead of vanishing. The addresses in a wrong-account answer are shown only for a repair
      // this tab (or the one that opened it) started: anyone can craft such a link.
      window.history.replaceState({}, '', '/');
      let repairStarted = false;
      try { repairStarted = !!sessionStorage.getItem(REPAIR_FLAG); sessionStorage.removeItem(REPAIR_FLAG); } catch { /* storage unavailable */ }
      const details = params.get('oauth_result') ? api.oauthResult().catch(() => null) : Promise.resolve(null);
      details.then((result) => {
        const wrong = trustedWrongAccount(result || { error: oauthError }, repairStarted);
        addNotification({
          type: 'error',
          title: t('accountErrors.signInFailed'),
          body: wrong ? t('accountErrors.wrongAccount', wrong) : t('accountErrors.signInFailedBody'),
        });
      });
    } else if (oidcSuccess) {
      window.history.replaceState({}, '', '/');
      if (oidcSuccess === 'linked') {
        addNotification({ type: 'info', title: t('admin.ssoLinked.title'), body: t('admin.ssoLinked.body') });
      } else if (oidcSuccess === 'reauth') {
        // Back from confirming through single sign-on: open the Security settings that asked for it.
        addNotification({ type: 'info', title: t('admin.ssoReauth.title'), body: t('admin.ssoReauth.body') });
        setAdminTab('security');
        setShowAdmin(true);
      }
    } else if (oidcError) {
      window.history.replaceState({}, '', '/');
      addNotification({ type: 'error', title: t('admin.ssoError.title'), body: oidcError });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="material-app" style={{
      width: '100vw', height: 'var(--app-height, 100svh)',
      overflow: 'hidden', background: 'var(--bg-primary)',
    }}>
    <div className="material-app-inner" data-ui-scale-root="" data-primary-view={showContacts || !selectedMessageId || undefined}
      data-mail-list-view={!showContacts && !selectedMessageId || undefined} style={{
      '--ui-scale': scale,
      display: 'flex',
      // Sized in CSS from the 100dvh parent: an innerHeight read on resize is stale during
      // a rotation in an iOS home-screen app, and the sidebar's bottom fell off screen.
      width: scale !== 1 ? `calc(100% / ${scale})` : '100%',
      height: scale !== 1 ? `calc(100% / ${scale})` : '100%',
      ...(scale !== 1 && {
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }),
      overflow: 'hidden',
      background: 'var(--bg-primary)',
      flexDirection: 'column',
      '--material-drawer-width': `${sidebarCollapsed ? 80 : Math.max(280, sidebarWidth)}px`,
    }}>
      {!isMobile && <header className="material-app-header">
        <div className="material-app-brand" data-collapsed={sidebarCollapsed}>
          {!overlayDrawer && <MaterialButton variant="icon" aria-label={t('messageList.menu')}
            aria-controls="material-folder-pane" aria-expanded={!sidebarCollapsed} onClick={toggleSidebar}>
            <MaterialIcon name="menu" />
          </MaterialButton>}
          <span className="material-brand-name"><LogoMark size={28} /><span>{appDisplayName}</span></span>
        </div>
        <div className="material-global-search" ref={setSearchHost} style={{ visibility: showContacts ? 'hidden' : undefined }} />
      </header>}
      <div className="material-workspace" ref={workspaceRef}>
      {overlayDrawer && <MaterialNavigation layout="rail" onToggleFolders={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        foldersOpen={mobileSidebarOpen} />}
      {isMobile ? (
        <>
          {/* Backdrop — covers full screen including status bar area */}
          {mobileSidebarOpen && (
            <div data-modal-scrim=""
              onClick={() => setMobileSidebarOpen(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 900,
                background: 'var(--overlay-scrim)',
                
                
              }}
            />
          )}
          {/* Slide-in sidebar drawer */}
          <div
            ref={drawerRef} id="material-folder-pane" role={mobileSidebarOpen ? 'dialog' : undefined} aria-modal={mobileSidebarOpen ? 'true' : undefined} aria-label={t('messageList.menu')}
            inert={!mobileSidebarOpen}
            aria-hidden={!mobileSidebarOpen}
            style={{
              position: 'fixed', left: 0, top: 0, bottom: 0,
              zIndex: 901, display: 'flex',
              visibility: mobileSidebarOpen ? 'visible' : 'hidden',
              transform: mobileSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform var(--md-sys-motion-default-spatial-standard)',
              boxShadow: mobileSidebarOpen ? 'var(--shadow-drawer)' : 'none',
            }}
            onTouchStart={(e) => {
              sidebarDragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY };
            }}
            onTouchEnd={(e) => {
              const start = sidebarDragRef.current;
              sidebarDragRef.current = null;
              if (!start) return;
              const dx = e.changedTouches[0].clientX - start.startX;
              const dy = e.changedTouches[0].clientY - start.startY;
              if (dx < -60 && Math.abs(dy) < Math.abs(dx)) setMobileSidebarOpen(false);
            }}
          >
            <Sidebar />
          </div>
          {/* Keep all three mounted so scroll/state survive navigation. */}
          <div style={{ flex: 1, overflow: 'hidden', height: '100%', display: showContacts ? 'flex' : 'none' }}>
            <Suspense fallback={lazyFallback}><ContactsPage /></Suspense>
          </div>
          <div style={{ flex: 1, display: !showContacts && !selectedMessageId ? 'flex' : 'none', overflow: 'hidden', height: '100%' }}>
            <MessageList />
          </div>
          <div style={{ flex: 1, display: !showContacts && selectedMessageId ? 'flex' : 'none', overflow: 'hidden', height: '100%' }}>
            <ReadingPane />
          </div>
        </>
      ) : (
        <>
          {mobileSidebarOpen && overlayDrawer && <div data-modal-scrim="" className="material-drawer-scrim" onClick={() => setMobileSidebarOpen(false)} />}
          <div ref={drawerRef} id="material-folder-pane" className="material-folder-rail" data-open={mobileSidebarOpen}
            role={mobileSidebarOpen && overlayDrawer ? 'dialog' : undefined} aria-modal={mobileSidebarOpen && overlayDrawer ? 'true' : undefined} aria-label={t('messageList.menu')}><Sidebar expandedRail={!overlayDrawer} onClose={overlayDrawer ? () => setMobileSidebarOpen(false) : undefined} /></div>
          {!sidebarCollapsed && !overlayDrawer && (
            <PaneResizeHandle paneId="material-folder-pane" label={t('material.folderPane')}
              min={280} max={400} scale={scale} reserve={!listFirst && currentLayout.direction === 'row' ? 518 : 336}
              reservePane={rightPanePinned && !showContacts ? 'material-right-pane' : undefined}
              onCommit={setSidebarWidth} onDragState={setIsSidebarResizing} />
          )}
          <div ref={mailContentRef} className="material-mail-content" style={{
            position: 'relative',
            flex: 1, display: 'flex', overflow: 'hidden',
            minWidth: 0, flexDirection: currentLayout.direction,
            height: '100%',
          }}>
            {/* Keep all three mounted so scroll/state survive navigation. */}
            <div style={{ display: showContacts ? 'flex' : 'none', flex: 1, minWidth: 0, overflow: 'hidden', height: '100%' }}>
              <Suspense fallback={lazyFallback}><ContactsPage /></Suspense>
            </div>
            <div className="material-mail-panes" data-split={!listFirst && currentLayout.direction === 'row' || undefined}
              style={{ display: showContacts ? 'none' : 'flex', flex: 1, minWidth: 0, overflow: 'hidden', height: '100%', flexDirection: currentLayout.direction, '--mail-list-reserve': `${listResizeReserve}px` }}>
              {listFirst ? (
                <>
                  {/* Both stay mounted, as on a phone, so the list keeps its place behind a message. */}
                  <div style={{ display: selectedMessageId ? 'none' : 'flex', flex: 1, minWidth: 0, overflow: 'hidden', height: '100%' }}>
                    <MessageList searchHost={searchHost} />
                  </div>
                  <div style={{ display: selectedMessageId ? 'flex' : 'none', flex: 1, minWidth: 0, overflow: 'hidden', height: '100%' }}>
                    <ReadingPane />
                  </div>
                </>
              ) : (
              <>
              <MessageList searchHost={searchHost} />
              {currentLayout.direction === 'row' && (
                <PaneResizeHandle key={scheduledView ? 'scheduled' : 'mailbox'} paneId="material-mail-list"
                  label={t(scheduledView ? 'sidebar.scheduled' : 'admin.messageList.title')}
                  min={180} max={700} scale={scale} reserve={listResizeReserve}
                  onPreview={width => document.documentElement.style.setProperty('--list-width', width + 'px')}
                  onCommit={width => {
                    document.documentElement.style.setProperty('--list-width', width + 'px');
                    localStorage.setItem('mailflow_list_width', String(width));
                  }} />
              )}
              <ReadingPane />
              </>
              )}
              {/* Generic right-sidebar column, populated from the content seam above. */}
              {currentLayout.direction === 'row' && rightSidebarContent != null && (
                <>
                  {/* Resize handle is omitted while the sidebar is hidden. */}
                  {rightPanePinned && !showContacts && (
                    <PaneResizeHandle key={scheduledView ? 'scheduled' : 'mailbox'} paneId="material-right-pane" label={t('material.rightPane')}
                      min={200} max={600} scale={scale} reverse reserve={322}
                      reservePane={listFirst ? undefined : 'material-mail-list'}
                      onPreview={width => document.documentElement.style.setProperty('--right-sidebar-width', width + 'px')}
                      onCommit={setRightSidebarWidth} onDragState={setIsRightSidebarResizing} />
                  )}
                  {/* Keep plugin state mounted; narrow layouts reopen it over the reader. */}
                  {sidebarOverlay && <div data-modal-scrim="" onClick={() => setRightSidebarOverlayOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 20, background: 'var(--overlay-scrim)' }} />}
                  <div ref={sidebarDialogRef} id="material-right-pane" inert={rightSidebarCollapsed} role={sidebarOverlay ? 'dialog' : undefined} aria-modal={sidebarOverlay ? true : undefined} aria-label={sidebarOverlay ? t('rightSidebar.show') : undefined} style={{
                    position: sidebarOverlay ? 'absolute' : 'relative', right: sidebarOverlay ? 0 : undefined, top: sidebarOverlay ? 0 : undefined, zIndex: sidebarOverlay ? 21 : undefined,
                    flexShrink: 0, overflow: 'hidden', height: '100%', maxWidth: '100%',
                    width: rightSidebarCollapsed ? 0 : 'var(--right-sidebar-width, 296px)',
                    // Disabled while dragging (mirrors Sidebar's isSidebarResizing guard):
                    // otherwise every mousemove's CSS-var write would animate toward the new
                    // width instead of tracking the cursor.
                    transition: isRightSidebarResizing ? 'none' : 'width var(--md-sys-motion-default-spatial-standard)',
                  }}>
                    <div style={{
                      width: 'var(--right-sidebar-width, 296px)', maxWidth: sidebarOverlay ? '100%' : undefined, height: '100%',
                      transform: rightSidebarCollapsed ? 'translateX(100%)' : 'translateX(0)',
                      transition: 'transform var(--md-sys-motion-default-spatial-standard)',
                    }}>
                      {rightSidebarContent}
                    </div>
                  </div>
                  {/* Slim always-visible reopen affordance pinned to the right edge. */}
                  {rightSidebarCollapsed && (
                    <MaterialButton variant="icon"
                      onClick={toggleVisibleRightSidebar}
                      aria-label={t('rightSidebar.show')}
                      title={rightSidebarToggleHint ? `${t('rightSidebar.show')} (${rightSidebarToggleHint})` : t('rightSidebar.show')}
                      style={{
                        width: 18, flexShrink: 0, cursor: 'pointer', padding: 0,
                        border: 'none', borderLeft: '1px solid var(--border)',
                        background: 'var(--bg-secondary)', color: 'var(--text-tertiary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      
                      
                    >
                      <MaterialIcon name="chevron_left" />
                    </MaterialButton>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      </div>

      <MaterialNavigation layout="bar" />
      <InboxReplyDraftObserver />
      <Suspense fallback={lazyFallback}>{composing && <ComposeModal key={composeSession} />}</Suspense>
      <Suspense fallback={lazyFallback}>{showAdmin && <AdminPanel />}</Suspense>
      {/* Detached message windows (#219) — desktop only. */}
      {!isMobile && <Suspense fallback={null}><WindowLayer /></Suspense>}
      <Suspense fallback={null}>{hasNativeBridge && <ElectronNotificationBridge />}</Suspense>
      <NotificationToasts />
      <BusinessNotice hidden={composing || showAdmin || (isMobile && mobileSidebarOpen)} />
      <PluginRuntime />
      <CommandPalette open={paletteOpen} labelPickerMessage={labelPickerMessage}
        onClose={() => { setPaletteOpen(false); setLabelPickerMessage(null); }} />

      {/* Keyboard shortcut help overlay — toggled by the '?' key */}
      {showShortcutHelp && (
        <ShortcutHelpOverlay
          shortcuts={shortcuts}
          onClose={() => setShowShortcutHelp(false)}
        />
      )}
    </div>
    </div>
  );
}

function ShortcutHelpOverlay({ shortcuts, onClose }) {
  const { t } = useTranslation();
  const dialogRef = useModalFocus({ onEscape: onClose });
  const effective = getEffectiveShortcuts(shortcuts);
  const groups    = getGroupedActions();

  const keyBadge = (key) => {
    if (!key) return <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--md-sys-typescale-body-small-size)' }}>—</span>;
    // Modifier combos like 'ctrl+p'
    const mod = parseModKey(key);
    if (mod) {
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <kbd style={kbdStyle}>{modLabel(mod.mod)}</kbd>
          <span style={{ color: 'var(--text-tertiary)', margin: '0 2px', fontSize: 'var(--md-sys-typescale-body-small-size)' }}>+</span>
          <kbd style={kbdStyle}>{mod.bare.toUpperCase()}</kbd>
        </span>
      );
    }
    // Special key names like 'Delete', 'ArrowUp' — single keypress, render as one badge
    if (SPECIAL_KEY_LABELS[key]) {
      return <kbd style={kbdStyle}>{SPECIAL_KEY_LABELS[key]}</kbd>;
    }
    // For two-key sequences like 'gi', render each key separately
    const parts = key.length > 1
      ? [...key].map((c, i) => (
          <span key={i}>
            <kbd style={kbdStyle}>{c}</kbd>
            {i < key.length - 1 && <span style={{ color: 'var(--text-tertiary)', margin: '0 2px', fontSize: 'var(--md-sys-typescale-body-small-size)' }}>{t('shortcuts.then')}</span>}
          </span>
        ))
      : [<kbd key={0} style={kbdStyle}>{key}</kbd>];
    return <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{parts}</span>;
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 6000,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
        animation: 'backdrop-enter var(--motion-fast) var(--ease-standard) both',
      }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('shortcuts.title')} className="material-modal"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--md-sys-shape-corner-large)',
          boxShadow: 'var(--shadow-modal)',
          width: '100%', maxWidth: 680,
          maxHeight: descaleCss('80vh'), overflow: 'auto',
          padding: '24px 28px',
          animation: 'modal-enter var(--motion-normal) var(--ease-emphasized) backwards',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 'var(--md-sys-typescale-body-large-size)', fontWeight: 700, color: 'var(--text-primary)' }}>{t('shortcuts.title')}</div>
          <MaterialButton variant="icon"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4, display: 'flex' }}
          >
            <MaterialIcon name="close" />
          </MaterialButton>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
          {Object.entries(groups).map(([groupName, actions]) => (
            <div key={groupName} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                {t(groupName)}
              </div>
              {actions.map(({ action }) => (
                <div key={action} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '5px 0', borderBottom: '1px solid var(--border-subtle)',
                }}>
                  <span style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-secondary)' }}>{shortcutActionText(t, action)}</span>
                  {keyBadge(effective[action])}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 8, fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
          {t('shortcuts.browserMailboxFallback', { defaultValue: 'In a browser: g then 1–9 opens a visible mailbox; g then l opens the label picker.' })}
        </div>
        <div style={{ marginTop: 8, fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
          {t('shortcuts.customizeHint')} &nbsp;·&nbsp; {t('shortcuts.closeHint')}
        </div>
      </div>
    </div>
  );
}

const kbdStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 22, height: 20, padding: '0 5px',
  background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
  borderBottomWidth: 2, borderRadius: 4,
  fontSize: 11, fontFamily: 'monospace', fontWeight: 600,
  color: 'var(--text-primary)',
};
