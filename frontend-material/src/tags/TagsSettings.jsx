import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MaterialButton, MaterialInput } from '../material/controls.jsx';
import { api } from '../utils/api.js';
import { TagSwatch } from './TagControls.jsx';
import { bumpTagDefinitions, refreshAllTags, useTagDefinitionsRevision } from './tagStore.js';

const emptyTag = { name: '', color: '#3b82f6' };
const rowStyle = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBlock: 8 };

export default function TagsSettings() {
  const { t } = useTranslation();
  const id = useId();
  const [definitions, setDefinitions] = useState(null);
  const [draft, setDraft] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const revision = useTagDefinitionsRevision();

  useEffect(() => {
    let active = true;
    api.tagDefinitions().then(data => { if (active) setDefinitions(data); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [revision]);

  function edit(tag) {
    setDraft(tag);
    setConfirm(false);
    setError('');
  }

  async function update(remove = false) {
    setBusy(true);
    setError('');
    try {
      const values = { name: draft.name.trim(), color: draft.color };
      if (remove) await api.tagDelete(draft.id);
      else if (draft.id) await api.tagUpdate(draft.id, values);
      else await api.tagCreate(values);
      edit(null);
      refreshAllTags();
      bumpTagDefinitions();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <section style={{ marginTop: 32 }}>
    <h3>{t('tags.title')}</h3>
    <p className="md-supporting-text">{t('tags.settings.note')}</p>
    {error && <p role="alert" style={{ color: 'var(--md-sys-color-error)' }}>{error}</p>}
    {!definitions && !error && <p role="status">{t('common.loading')}</p>}
    {definitions?.map(tag => <div key={tag.id} style={rowStyle}>
      <span style={{ flex: 1, overflowWrap: 'anywhere' }}><TagSwatch color={tag.color} />{tag.name}</span>
      <MaterialButton type="button" variant="text" disabled={busy} onClick={() => edit(tag)}>{t('common.edit')}</MaterialButton>
    </div>)}
    {draft ? <form onSubmit={event => { event.preventDefault(); if (!busy && !confirm) void update(); }}>
      <div style={rowStyle}>
        <label className="md-field-label" htmlFor={id + '-name'}>{t('tags.settings.name')}</label>
        <MaterialInput id={id + '-name'} value={draft.name} disabled={busy} required maxLength={80}
          onChange={event => setDraft({ ...draft, name: event.target.value })} />
        <label className="md-field-label" htmlFor={id + '-color'}>{t('tags.settings.color')}</label>
        <input id={id + '-color'} type="color" value={draft.color} disabled={busy}
          onChange={event => setDraft({ ...draft, color: event.target.value })} />
      </div>
      <div style={rowStyle}>
        <MaterialButton type="submit" variant="filled" disabled={busy || confirm || !draft.name.trim()}>
          {t(draft.id ? 'common.save' : 'tags.settings.create')}
        </MaterialButton>
        {draft.id && !confirm && <MaterialButton type="button" variant="outlined" disabled={busy}
          onClick={() => setConfirm(true)}>{t('common.delete')}</MaterialButton>}
        <MaterialButton type="button" variant="text" disabled={busy} onClick={() => edit(null)}>{t('common.cancel')}</MaterialButton>
      </div>
      {confirm && <div style={rowStyle}>
        <span>{t('tags.settings.confirmDelete', { name: definitions?.find(tag => tag.id === draft.id)?.name })}</span>
        <MaterialButton type="button" variant="outlined" disabled={busy} onClick={() => update(true)}>{t('common.delete')}</MaterialButton>
        <MaterialButton type="button" variant="text" disabled={busy} onClick={() => setConfirm(false)}>{t('common.cancel')}</MaterialButton>
      </div>}
    </form> : <MaterialButton type="button" variant="filled" disabled={!definitions} onClick={() => edit(emptyTag)}>
      {t('tags.settings.add')}
    </MaterialButton>}
  </section>;
}
