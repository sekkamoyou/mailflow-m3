import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/index.js';
import { MaterialButton, MaterialInput } from '../material/controls.jsx';

export default function AppearanceSyncSettings() {
  const { t } = useTranslation();
  const { appearanceMode, appearanceDevice, appearanceStatus, personalDisplayName, serverDisplayName,
    setAppearanceMode, setPersonalDisplayName, retryAppearance } = useStore();
  const [name, setName] = useState(personalDisplayName);
  const [editing, setEditing] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const hint = useId();
  useEffect(() => { if (!editing) setName(personalDisplayName); }, [personalDisplayName, editing]);
  const status = appearanceStatus === 'error' ? 'material.appearanceSync.error'
    : appearanceStatus === 'saved' ? 'material.appearanceSync.saved' : 'material.appearanceSync.saving';
  return <section className="md-appearance-sync">
    <fieldset>
      <legend>{t('material.appearanceSync.title')}</legend>
      <p>{t(appearanceDevice === 'mobile' ? 'material.appearanceSync.mobile' : 'material.appearanceSync.desktop')}</p>
      {['shared', 'separate'].map(mode => <label key={mode} className="md-appearance-sync-choice">
        <MaterialInput type="radio" name="appearance-sync-mode" value={mode} checked={appearanceMode === mode}
          onChange={() => setAppearanceMode(mode)} />
        <span>{t(mode === 'shared' ? 'material.appearanceSync.shared' : 'material.appearanceSync.separate')}</span>
      </label>)}
      <p>{t('material.appearanceSync.transition')}</p>
    </fieldset>
    <form onSubmit={event => {
      event.preventDefault();
      const control = [...name].some(char => char.codePointAt(0) < 32 || (char.codePointAt(0) >= 127 && char.codePointAt(0) <= 159));
      if ([...name].length > 60 || control || /[\u202a-\u202e\u2066-\u2069]/u.test(name)) { setInvalid(true); return; }
      setPersonalDisplayName(name); setEditing(false); setInvalid(false);
    }}>
      <label>
        <span>{t('material.appearanceSync.name')}</span>
        <MaterialInput value={name} placeholder={serverDisplayName} maxLength={60} aria-describedby={hint} aria-invalid={invalid || undefined}
          onChange={event => { setName(event.target.value); setEditing(true); setInvalid(false); }} />
      </label>
      <p id={hint}>{t('material.appearanceSync.nameHint')}</p>
      {invalid && <p role="alert">{t('admin.appearance.brandingInvalidName')}</p>}
      <MaterialButton type="submit" variant="tonal" disabled={name.trim() === personalDisplayName}>{t('common.save')}</MaterialButton>
    </form>
    <p>{t('material.appearanceSync.pwaHint')}</p>
    <div className="md-appearance-sync-status">
      <span role={appearanceStatus === 'error' ? 'alert' : 'status'}>{t(status)}</span>
      {appearanceStatus === 'error' && <MaterialButton onClick={retryAppearance}>{t('material.appearanceSync.retry')}</MaterialButton>}
    </div>
  </section>;
}
