import { useModalFocus } from '../material/useModalFocus.js';
import { MaterialButton, MaterialIcon } from '../material/controls.jsx';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { copyToClipboard } from '../utils/clipboard.js';
import { useStore } from '../store/index.js';
import { useUiScale } from '../hooks/useUiScale.js';
import { generateReport } from '../utils/diagnostics.js';

// Sanitized diagnostics report: generate, preview (so the user can see exactly
// what will be shared), then download or copy. Nothing is sent automatically.
export default function DiagnosticsReportModal({ onClose }) {
  const materialDialogRef = useModalFocus({ onEscape: onClose });
  const { t, i18n } = useTranslation();
  const theme = useStore(s => s.theme);
  const uiScale = useUiScale();
  const addNotification = useStore(s => s.addNotification);
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    generateReport({ locale: i18n.language, theme, uiScale })
      .then(r => { if (!cancelled) setState({ status: 'done', ...r }); })
      .catch(err => { if (!cancelled) setState({ status: 'error', error: err?.message || 'error' }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const download = () => {
    const blob = new Blob([state.json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mailflow-diagnostics-${state.report?.meta?.reportId || 'report'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    try {
      const { ok } = await copyToClipboard(state.json);
      if (!ok) throw new Error('copy failed');
      addNotification({ title: t('diagnostics.copied') });
    } catch {
      addNotification({ type: 'error', title: t('diagnostics.copyFailed') });
    }
  };

  return (
    <div className="material-modal-scrim"
      onClick={onClose}
      style={{ zIndex: 5000 }}
    >
      <div ref={materialDialogRef} role="dialog" aria-modal="true" aria-label={t('diagnostics.title')} className="material-modal material-dialog-frame"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--md-sys-shape-corner-medium)',
          width: 'min(640px, 100%)',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        <div className="material-dialog-header">
          <h2>{t('diagnostics.title')}</h2>
          <MaterialButton variant="icon" onClick={onClose} aria-label={t('common.cancel')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 'var(--md-sys-typescale-body-large-size)', lineHeight: 1 }}><MaterialIcon name="close" /></MaterialButton>
        </div>

        <div className="material-dialog-body"><div className="material-dialog-content">
          {state.status === 'loading' && (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--md-sys-typescale-body-medium-size)' }}>{t('diagnostics.generating')}</div>
          )}
          {state.status === 'error' && (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--red, #ef4444)', fontSize: 'var(--md-sys-typescale-body-medium-size)' }}>{t('diagnostics.error')}</div>
          )}
          {state.status === 'done' && (<>
            <p style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--text-secondary)', margin: '0 0 10px' }}>{t('diagnostics.blurb')}</p>
            <div style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>
              <div style={{ marginBottom: 4 }}>{t('diagnostics.includes')}</div>
              <div>{t('diagnostics.excludes')}</div>
            </div>
            <pre style={{
              margin: 0, padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--md-sys-shape-corner-small)', fontSize: 'var(--md-sys-typescale-body-small-size)', lineHeight: 1.45, color: 'var(--text-primary)',
              overflowX: 'auto', whiteSpace: 'pre', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}>{state.json}</pre>
          </>)}
        </div>

        </div>
        <div className="material-dialog-actions">
          <MaterialButton variant="text" onClick={copy} disabled={state.status !== 'done'} style={btnStyle(false, state.status !== 'done')}>{t('common.copy')}</MaterialButton>
          <MaterialButton variant="text" onClick={download} disabled={state.status !== 'done'} style={btnStyle(true, state.status !== 'done')}>{t('diagnostics.download')}</MaterialButton>
        </div>
      </div>
    </div>
  );
}

function btnStyle(primary, disabled) {
  return {
    padding: '7px 14px', borderRadius: 7, fontSize: 12.5, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    border: primary ? 'none' : '1px solid var(--border)',
    background: primary ? 'var(--accent)' : 'transparent',
    color: primary ? 'var(--accent-text)' : 'var(--text-secondary)',
  };
}
