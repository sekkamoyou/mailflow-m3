import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LAYOUTS } from '../layouts.js';
import MaterialDialog from './MaterialDialog.jsx';
import { MaterialButton, MaterialIcon, MaterialSelect } from './controls.jsx';

export default function MailboxToolbar({ label, count, syncing, onSync, syncLabel, onMenu, scrolled, selectionMode, onSelection, unreadOnly, onUnread, pageSize, onPageSize, layout, onLayout, onSearch, search, sorting, orderSummary }) {
  const { t } = useTranslation();
  const [preferences, setPreferences] = useState(false);
  const searchTrigger = useRef(null);
  const searching = Boolean(search);
  const wasSearching = useRef(searching);
  useLayoutEffect(() => {
    if (wasSearching.current && !searching) searchTrigger.current?.focus({ preventScroll: true });
    wasSearching.current = searching;
  }, [searching]);
  return <>
    <div className="material-list-toolbar" data-scrolled={scrolled || undefined}>
      {search || <>
      {onMenu && <MaterialButton variant="icon" aria-label={t('messageList.menu')} onClick={onMenu}><MaterialIcon name="menu" /></MaterialButton>}
      <h2 title={orderSummary ? `${label} — ${t('messageList.sortedBy', { order: orderSummary })}` : label}><span>{label}</span>{orderSummary && <span className="material-list-order">{orderSummary}</span>}</h2>
      {count != null && <span className="material-list-count">{count}</span>}
      <div className="material-list-actions">
        {onSearch
          ? <MaterialButton ref={searchTrigger} className="material-search-toggle" variant="icon" aria-label={t('messageList.search')} onClick={onSearch}><MaterialIcon name="search" /></MaterialButton>
          : <MaterialButton className="material-sync-action" variant="icon" title={syncLabel} disabled={syncing} onClick={onSync}><MaterialIcon name="sync" /></MaterialButton>}
        <MaterialButton className="material-selection-toggle" variant="text" title={selectionMode ? t('messageList.clearSelection') : t('messageList.selectMessages')} aria-label={selectionMode ? t('messageList.clearSelection') : t('messageList.selectMessages')} aria-pressed={Boolean(selectionMode)} selected={selectionMode} onClick={onSelection}><MaterialIcon name={selectionMode ? 'close' : 'checklist'} /><span>{selectionMode ? t('common.cancel') : t('contextMenu.select')}</span></MaterialButton>
        <MaterialButton variant="icon" title={t('messageList.changeLayout')} aria-haspopup="dialog" aria-expanded={preferences} onClick={() => { if (selectionMode) onSelection?.(); setPreferences(true); }}><MaterialIcon name="tune" /></MaterialButton>
      </div>
      </>}
    </div>
    {preferences && createPortal(<div className="md-picker-scrim" onClick={() => setPreferences(false)}>
      <MaterialDialog className="material-list-preferences" aria-label={t('messageList.layout')} onClose={() => setPreferences(false)} onClick={event => event.stopPropagation()}>
        <h2>{t('messageList.layout')}</h2>
        <div className="material-list-preferences-scroll">
          <div className="material-list-preferences-content">
            {sorting}
            <div className="material-preference-row">
              <span>{t('messageList.unreadOnly')}</span>
              <MaterialButton variant="switch" role="switch" aria-label={t('messageList.unreadOnly')} aria-checked={unreadOnly} onClick={() => onUnread(!unreadOnly)} />
            </div>
            <label className="material-preference-field"><span>{t('messageList.messagesPerPage')}</span>
              <MaterialSelect value={pageSize} onChange={event => onPageSize(Number(event.target.value))}>
                {[25, 50, 100, 200].map(value => <option key={value} value={value}>{value}</option>)}
              </MaterialSelect>
            </label>
            <label className="material-preference-field"><span>{t('messageList.layout')}</span>
              <MaterialSelect value={layout} onChange={event => onLayout(event.target.value)}>
                {Object.entries(LAYOUTS).map(([key, definition]) => <option key={key} value={key}>{t(definition.labelKey, definition.label)}</option>)}
              </MaterialSelect>
            </label>
          </div>
        </div>
        <div className="material-dialog-actions"><MaterialButton variant="text" disabled={syncing} onClick={onSync}>{syncLabel}</MaterialButton><MaterialButton variant="text" onClick={() => setPreferences(false)}>{t('admin.close')}</MaterialButton></div>
      </MaterialDialog>
    </div>, document.body)}
  </>;
}
