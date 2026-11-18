import DateTimeInput from '../material/DateTimeInput.jsx';
import { useModalFocus } from '../material/useModalFocus.js';
import { MaterialIcon } from '../material/controls.jsx';
import { MaterialButton, MaterialInput, MaterialTextarea, MaterialSelect } from '../material/controls.jsx';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/index.js';
import { api } from '../utils/api.js';

export default function TodoistTaskModal({ message, onClose }) {
  const materialDialogRef = useModalFocus({ onEscape: onClose });
  const { t } = useTranslation();
  const { addNotification } = useStore();

  const [title, setTitle] = useState(message?.subject || '');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [priority, setPriority] = useState(1);
  const [dueDate, setDueDate] = useState('');
  const [projects, setProjects] = useState([]);
  const [labels, setLabels] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [projs, lbls] = await Promise.all([
          api.todoist.getProjects(),
          api.todoist.getLabels(),
        ]);
        setProjects(projs);
        setLabels(lbls);
      } catch (err) {
        setLoadError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function toggleLabel(name) {
    setSelectedLabels(prev =>
      prev.includes(name) ? prev.filter(l => l !== name) : [...prev, name]
    );
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setCreating(true);
    setError('');
    try {
      // Key the deep link on the stable Message-ID header so it survives the email being
      // moved to another folder (the row's UUID is regenerated on move/resync). Fall back to
      // the UUID for messages with no Message-ID. Both resolve via /resolve-message (#270).
      const linkRef = message?.message_id || message?.id;
      const mailflowLink = linkRef ? `[View in MailFlow](${window.location.origin}/?m=${encodeURIComponent(linkRef)})` : '';
      const fullDescription = [description.trim(), mailflowLink].filter(Boolean).join('\n\n');
      const task = await api.todoist.createTask({
        content: title.trim(),
        description: fullDescription,
        project_id: projectId || undefined,
        labels: selectedLabels.length ? selectedLabels : undefined,
        priority: priority > 1 ? priority : undefined,
        due_date: dueDate || undefined,
      });
      addNotification({
        title: t('todoist.taskCreated'),
        body: title.trim(),
        actionLabel: t('todoist.openTask'),
        onAction: () => window.open(task.url, '_blank', 'noopener'),
      });
      onClose();
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  const inputStyle = {
    padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  const labelStyle = { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' };

  const priorities = [
    { value: 4, label: t('todoist.priorityUrgent') },
    { value: 3, label: t('todoist.priorityHigh') },
    { value: 2, label: t('todoist.priorityMedium') },
    { value: 1, label: t('todoist.priorityNormal') },
  ];

  return (
    <div className="material-modal-scrim"
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        zIndex: 3000,
      }}
    >
      <div ref={materialDialogRef} role="dialog" aria-modal="true" aria-label={t('todoist.title')} className="material-modal material-dialog-frame" style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--md-sys-shape-corner-large)', width: '100%', maxWidth: 480,
        boxShadow: 'var(--shadow-modal)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div className="material-dialog-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--accent)">
              <path d="M21 0H3C1.35 0 0 1.35 0 3v3.858s3.854 2.24 4.098 2.38c.31.18.694.177 1.004 0 .26-.147 8.02-4.608 8.136-4.675.279-.161.58-.107.748-.01.164.097.606.348.84.48.232.134.221.502.013.622l-9.712 5.59c-.346.2-.69.204-1.048.002C3.478 10.907.998 9.463 0 8.882v2.02l4.098 2.38c.31.18.694.177 1.004 0 .26-.147 8.02-4.609 8.136-4.676.279-.16.58-.106.748-.008.164.096.606.347.84.48.232.133.221.5.013.62-.208.121-9.288 5.346-9.712 5.59-.346.2-.69.205-1.048.002C3.478 14.951.998 13.506 0 12.926v2.02l4.098 2.38c.31.18.694.177 1.004 0 .26-.147 8.02-4.609 8.136-4.676.279-.16.58-.106.748-.009.164.097.606.348.84.48.232.133.221.502.013.622l-9.712 5.59c-.346.199-.69.204-1.048.001C3.478 18.994.998 17.55 0 16.97V21c0 1.65 1.35 3 3 3h18c1.65 0 3-1.35 3-3V3c0-1.65-1.35-3-3-3z"/>
            </svg>
            <h2>
              {t('todoist.title')}
            </h2>
          </div>
          <MaterialButton variant="icon"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4, display: 'flex' }}
          >
            <MaterialIcon name="close" />
          </MaterialButton>
        </div>

        {/* Body */}
        <div className="material-dialog-body"><div className="material-dialog-content">
          {/* Title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={labelStyle}>{t('todoist.taskTitle')}</label>
            <MaterialInput
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !creating && title.trim() && handleCreate()}
              placeholder={t('todoist.taskTitlePh')}
              autoFocus
              style={inputStyle}
            />
          </div>

          {/* Description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={labelStyle}>{t('todoist.description')}</label>
            <MaterialTextarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('todoist.descriptionPh')}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {loading ? (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--md-sys-typescale-body-medium-size)', textAlign: 'center', padding: '4px 0' }}>
              {t('common.loading')}
            </div>
          ) : loadError ? (
            <div style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--red, #f87171)', padding: '8px 10px', borderRadius: 'var(--md-sys-shape-corner-small)', background: 'rgba(248,113,113,0.08)' }}>
              {loadError}
            </div>
          ) : (
            <>
              {/* Project */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={labelStyle}>{t('todoist.project')}</label>
                <MaterialSelect
                  value={projectId}
                  onChange={e => setProjectId(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">{t('todoist.inbox')}</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </MaterialSelect>
              </div>

              {/* Labels */}
              {labels.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={labelStyle}>{t('todoist.labels')}</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {labels.map(l => {
                      const active = selectedLabels.includes(l.name);
                      return (
                        <MaterialButton selected={active} aria-pressed={Boolean(active)} variant="chip"
                          key={l.id}
                          onClick={() => toggleLabel(l.name)}
                          style={{
                            padding: '4px 10px', borderRadius: 'var(--md-sys-shape-corner-extra-large)', fontSize: 'var(--md-sys-typescale-body-small-size)',
                            border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
                            background: active ? 'rgba(99,102,241,0.15)' : 'var(--bg-tertiary)',
                            color: active ? 'var(--accent)' : 'var(--text-secondary)',
                            cursor: 'pointer', transition: 'all 0.1s',
                          }}
                        >
                          {l.name}
                        </MaterialButton>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Priority + Due date */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ flex: '1 1 150px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={labelStyle}>{t('todoist.priority')}</label>
              <MaterialSelect
                value={priority}
                onChange={e => setPriority(Number(e.target.value))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {priorities.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </MaterialSelect>
            </div>
            <div style={{ flex: '1 1 150px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label htmlFor="todoist-due-date" style={labelStyle}>{t('todoist.dueDate')}</label>
              <DateTimeInput
                id="todoist-due-date" type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {error && (
            <div style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--red, #f87171)', padding: '8px 10px', borderRadius: 'var(--md-sys-shape-corner-small)', background: 'rgba(248,113,113,0.08)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        </div>
        <div className="material-dialog-actions">
          <MaterialButton variant="outlined"
            onClick={onClose}
            style={{
              padding: '7px 16px', borderRadius: 'var(--md-sys-shape-corner-small)', border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 'var(--md-sys-typescale-body-medium-size)',
            }}
          >
            {t('common.cancel')}
          </MaterialButton>
          <MaterialButton variant="filled"
            onClick={handleCreate}
            disabled={creating || !title.trim()}
            style={{
              padding: '7px 16px', borderRadius: 'var(--md-sys-shape-corner-small)', border: 'none',
              background: 'var(--accent)', color: 'var(--accent-text)',
              cursor: (creating || !title.trim()) ? 'default' : 'pointer',
              fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 500, opacity: (creating || !title.trim()) ? 0.7 : 1,
            }}
          >
            {creating ? t('todoist.creating') : t('todoist.create')}
          </MaterialButton>
        </div>
      </div>
    </div>
  );
}
