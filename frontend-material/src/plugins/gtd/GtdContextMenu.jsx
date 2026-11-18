import { MaterialIcon, MaterialButton } from '../../material/controls.jsx';
import { useTranslation } from 'react-i18next';
import { GTD_STATES, GTD_COLORS, resolveAccountGtdFolders, gtdStatesInFolders, unclassifyThread } from '../../utils/gtd.js';
import { useStore } from '../../store/index.js';
import { api } from '../../utils/api.js';
import { classifyWithUndo } from '../../utils/gtdClassification.js';

// GTD's context-menu contributions, injected into core's 'context-menu-actions' collector so the
// menu itself carries no GTD-specific code. Placement is preserved: core splices these items into
// the 'Actions' group exactly where the GTD entries used to sit (after "Categorize"). Actions still
// dispatch through the caller-provided onAction ('gtdClassify'/'gtdRemove'/'gtdDone') — the same
// channel core used — now owned by the plugin.

// The classify + remove submenu shown when the "GTD" item is opened. Renders its own back row and
// takes over the menu content area (via core's generic plugin-submenu view). Classify offers every
// state; "Remove from <state>" is offered only for the states this thread is actually labelled with.
function GtdContextSubmenu({ message, account, onClose, onBack }) {
  const { t } = useTranslation();
  const addNotification = useStore(s => s.addNotification);
  const scheduleGtdSectionsFetch = useStore(s => s.scheduleGtdSectionsFetch);
  const gtdFolders = resolveAccountGtdFolders(account);
  const removableStates = gtdStatesInFolders(message.folders, gtdFolders);
  // Classify = COPY into the state's label folder (message stays put); remove = strip that label.
  // Store-based, so they run the same on every surface — no dependency on the caller's onAction.
  const classify = (state) => {
    void classifyWithUndo(message.id, state, {
      api,
      store: useStore,
      t,
      message,
    });
    onClose();
  };
  const removeFrom = (state) => { unclassifyThread(message.id, state, { gtdUnclassify: api.gtdUnclassify, addNotification, scheduleGtdSectionsFetch, t, message }); onClose(); };
  return (
    <>
      <MaterialButton variant="menu" role="menuitem" tabIndex={-1} data-menu-back=""
        onClick={onBack}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', cursor: 'pointer',
          borderBottom: '1px solid var(--border-subtle)',
          color: 'var(--text-secondary)', fontSize: 'var(--md-sys-typescale-body-small-size)',
        }}
      >
        <MaterialIcon name="chevron_left" />
        {t('gtd.title')}
      </MaterialButton>
      {GTD_STATES.map(state => (
        <MaterialButton variant="menu" role="menuitem" tabIndex={-1}
          key={state}
          onClick={() => classify(state)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', cursor: 'pointer', fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--text-primary)' }}
        >
          <span style={{ width: 9, height: 9, borderRadius: 'var(--md-sys-shape-corner-extra-small)', flexShrink: 0, background: GTD_COLORS[state] }} />
          <span style={{ flex: 1 }}>{t(`gtd.state.${state}`)}</span>
        </MaterialButton>
      ))}
      {removableStates.length > 0 && (
        <>
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '3px 0' }} />
          {removableStates.map(state => (
            <MaterialButton variant="menu" role="menuitem" tabIndex={-1}
              key={`rm-${state}`}
              onClick={() => removeFrom(state)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', cursor: 'pointer', fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--text-secondary)' }}
            >
              <MaterialIcon name="remove" />
              <span style={{ flex: 1 }}>{t('gtd.removeFrom', { state: t(`gtd.state.${state}`) })}</span>
            </MaterialButton>
          ))}
        </>
      )}
    </>
  );
}

// Build GTD's context-menu items for the 'context-menu-actions' collector. ctx (from ContextMenu):
// { message, account, variant, onAction, onClose, openSubmenu, t }. Returns [] when GTD is off for
// the account (so a non-GTD account contributes nothing). The "Done" entry is sidebar-only, mirroring
// the old menuPolicy.done gate (variant === 'gtdSidebar').
export function buildGtdContextItems(ctx) {
  const { message, account, variant, onAction, onClose, openSubmenu, t } = ctx;
  const items = [];
  if (account?.gtd_enabled) {
    items.push({
      label: t('gtd.title'),
      icon: <MaterialIcon name="task_alt" />,
      keepOpen: true,
      hasSubmenu: true,
      action: () => openSubmenu((onBack) => (
        <GtdContextSubmenu message={message} account={account} onClose={onClose} onBack={onBack} />
      )),
    });
  }
  // The sidebar's "done" checkmark — section-scoped stripping happens in the caller's onAction.
  if (variant === 'gtdSidebar') {
    items.push({
      label: t('gtd.done'),
      icon: <MaterialIcon name="check" />,
      action: () => onAction('gtdDone'),
    });
  }
  return items;
}
