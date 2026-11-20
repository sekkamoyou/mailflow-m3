import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MaterialButton, MaterialIcon } from '../material/controls.jsx';
import { api } from '../utils/api.js';
import { canTagMessage, invalidateTags, useMessageTags, useTagDefinitionsRevision } from './tagStore.js';

const pillStyle = {
  display: 'inline-block', maxWidth: '10em', overflow: 'hidden',
  textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderRadius: 'var(--md-sys-shape-corner-full)',
  padding: '2px 8px', fontSize: 'var(--md-sys-typescale-label-small-size)',
  lineHeight: 1.4, border: '1px solid var(--md-sys-color-outline-variant)',
  color: 'var(--md-sys-color-on-surface-variant)', background: 'var(--md-sys-color-surface-container-high)',
};

export function TagSwatch({ color }) {
  return <span aria-hidden="true" style={{ display: 'inline-block', width: 9, height: 9, flexShrink: 0,
    borderRadius: 9, marginInlineEnd: 6, background: color }} />;
}

export function MessageTags({ messageId }) {
  const tags = useMessageTags(canTagMessage(messageId) ? messageId : null);
  if (!tags.length) return null;
  return <span style={{ display: 'inline-flex', gap: 4, maxWidth: '100%', overflow: 'hidden' }}>
    {tags.map(tag => <span key={tag.tagId} style={pillStyle} title={tag.name}><TagSwatch color={tag.color} />{tag.name}</span>)}
  </span>;
}

function TagPicker({ messageId, menu = false }) {
  const { t } = useTranslation();
  const [definitions, setDefinitions] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const current = useMessageTags(messageId);
  const revision = useTagDefinitionsRevision();

  useEffect(() => {
    let active = true;
    api.tagDefinitions().then(data => { if (active) setDefinitions(data); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [revision]);

  async function toggle(id, applied) {
    setBusy(true);
    setError('');
    try {
      await api.tagSet(messageId, id, applied);
      invalidateTags([messageId]);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <div style={{ padding: '4px 8px' }}>
    {error && <p role="alert" style={{ color: 'var(--md-sys-color-error)' }}>{error}</p>}
    {definitions?.length === 0 && <p>{t('tags.header.none')}</p>}
    {!definitions && !error && <p role="status">{t('common.loading')}</p>}
    {definitions?.map(tag => {
      const applied = current.some(value => value.tagId === tag.id);
      return <MaterialButton key={tag.id} type="button" variant="text" role={menu ? 'menuitemcheckbox' : 'checkbox'}
        aria-checked={applied} tabIndex={menu ? -1 : undefined} aria-disabled={busy || undefined}
        onClick={() => { if (!busy) void toggle(tag.id, !applied); }}
        style={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
        <MaterialIcon name={applied ? 'check_box' : 'check_box_outline_blank'} size={16} />
        <TagSwatch color={tag.color} />{tag.name}
      </MaterialButton>;
    })}
  </div>;
}

export function TagMenu({ messageId, onBack }) {
  const { t } = useTranslation();
  return <>
    <MaterialButton type="button" variant="text" role="menuitem" data-menu-back tabIndex={-1} onClick={onBack}>
      <MaterialIcon name="arrow_back" size={16} />{t('tags.title')}
    </MaterialButton>
    <TagPicker messageId={messageId} menu />
  </>;
}

export function HeaderTags({ messageId }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!canTagMessage(messageId)) return null;
  return <>
    <MessageTags messageId={messageId} />
    <MaterialButton type="button" variant="text" size="small" aria-expanded={open} onClick={() => setOpen(!open)}>
      <MaterialIcon name="label" size={16} />{open ? t('tags.header.hide') : t('tags.title')}
    </MaterialButton>
    {open && <div style={{ flexBasis: '100%' }}><TagPicker messageId={messageId} /></div>}
  </>;
}
