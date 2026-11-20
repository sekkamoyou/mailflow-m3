import { useTranslation } from 'react-i18next';
import { useStore } from '../store/index.js';
import { MaterialButton, MaterialIcon } from './controls.jsx';

export default function MaterialNavigation({ layout, onToggleFolders, foldersOpen }) {
  const { t } = useTranslation();
  const { showContacts, setShowContacts, showAdmin, setShowAdmin } = useStore();
  return <nav className="material-navigation" data-layout={layout} aria-label={t('material.navigation', { defaultValue: 'Navigation' })}>
    {onToggleFolders && <MaterialButton variant="icon" className="material-rail-toggle" aria-label={t('messageList.menu')}
      aria-controls="material-folder-pane" aria-expanded={foldersOpen} onClick={onToggleFolders}>
      <MaterialIcon name="menu" />
    </MaterialButton>}
    <MaterialButton variant="navigation" aria-label={t('material.mail')} title={t('material.mail')} selected={!showContacts && !showAdmin} aria-current={!showContacts && !showAdmin ? 'page' : undefined} onClick={() => { setShowContacts(false); setShowAdmin(false); }}>
      <MaterialIcon name="mail" /><span>{t('material.mail', { defaultValue: 'Mail' })}</span>
    </MaterialButton>
    <MaterialButton variant="navigation" aria-label={t('contacts.title')} title={t('contacts.title')} selected={showContacts && !showAdmin} aria-current={showContacts && !showAdmin ? 'page' : undefined} onClick={() => { setShowContacts(true); setShowAdmin(false); }}>
      <MaterialIcon name="contacts" /><span>{t('contacts.title')}</span>
    </MaterialButton>
    {layout !== 'bar' && <MaterialButton variant="navigation" className="material-rail-settings" aria-label={t('sidebar.settings')} title={t('sidebar.settings')} selected={showAdmin} aria-haspopup="dialog" onClick={() => setShowAdmin(true)}>
      <MaterialIcon name="settings" /><span>{t('sidebar.settings')}</span>
    </MaterialButton>}
  </nav>;
}
