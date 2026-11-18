import { descaleCss } from '../utils/uiScaleCss.js';
import { useModalFocus } from '../material/useModalFocus.js';
import { MaterialIcon } from '../material/controls.jsx';
import { MaterialButton } from '../material/controls.jsx';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { copyToClipboard } from '../utils/clipboard.js';
import { api } from '../utils/api.js';
import { useMobile } from '../hooks/useMobile.js';

export default function MessageHeaderModal({ messageId, subject, onClose, onSubjectResolved }) {
  const materialDialogRef = useModalFocus({ onEscape: onClose });
  const { t } = useTranslation();
  const isMobile = useMobile();
  const [headers, setHeaders] = useState(null);
  const [resolvedSubject, setResolvedSubject] = useState(subject);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const onSubjectResolvedRef = useRef(onSubjectResolved);
  onSubjectResolvedRef.current = onSubjectResolved;

  useEffect(() => {
    api.getMessageHeaders(messageId)
      .then(data => {
        setHeaders(data.headers);
        if (data.subject && data.subject !== '(no subject)') {
          setResolvedSubject(data.subject);
          onSubjectResolvedRef.current?.(data.subject);
        }
      })
      .catch(err => setHeaders(`Error: ${err.message}`))
      .finally(() => setLoading(false));
  }, [messageId]);

  const handleCopy = async () => {
    const { ok } = await copyToClipboard(headers || '');
    if (!ok) return; // leave the button unchanged rather than claiming a copy that failed
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const parsedHeaders = [];
  if (headers) {
    const lines = headers.split('\n');
    let current = null;
    for (const line of lines) {
      if (/^\s/.test(line) && current) {
        current.value += ' ' + line.trim();
      } else {
        const colon = line.indexOf(':');
        if (colon > 0) {
          current = { key: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() };
          parsedHeaders.push(current);
        }
      }
    }
  }

  const displaySubject = (resolvedSubject && resolvedSubject !== '(no subject)')
    ? resolvedSubject
    : (parsedHeaders.find(h => h.key.toLowerCase() === 'subject')?.value || t('common.noSubject'));

  if (isMobile) {
    return (
      <div ref={materialDialogRef} role="dialog" aria-modal="true" aria-label={t('contextMenu.headers.title')} style={{
        position: 'fixed', inset: 0, zIndex: 5000,
        background: 'var(--bg-secondary)',
        display: 'flex', flexDirection: 'column',
        paddingTop: 'var(--sat)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--md-sys-typescale-body-large-size)', fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('contextMenu.headers.title')}
            </div>
            <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displaySubject}
            </div>
          </div>
          <MaterialButton variant="text" selected={copied}
            onClick={handleCopy}
            style={{
              flexShrink: 0, padding: '6px 12px',
              background: copied ? 'var(--accent-dim)' : 'var(--bg-tertiary)',
              border: `1px solid ${copied ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--md-sys-shape-corner-small)', color: copied ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer', fontSize: 'var(--md-sys-typescale-body-small-size)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {copied ? t('contextMenu.headers.copied') : t('contextMenu.headers.copyRaw')}
          </MaterialButton>
          <MaterialButton variant="icon"
            type="button"
            onClick={onClose}
            aria-label={t('window.close')}
            title={t('window.close')}
            style={{
              flexShrink: 0, background: 'none', border: 'none', padding: 6,
              color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 'var(--md-sys-shape-corner-small)',
              display: 'flex', alignItems: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <MaterialIcon name="close" />
          </MaterialButton>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--md-sys-typescale-body-medium-size)', padding: '12px 16px' }}>
              {t('contextMenu.headers.loading')}
            </div>
          )}
          {!loading && parsedHeaders.length > 0 && parsedHeaders.map((h, i) => {
            return (
              <div key={i} style={{
                borderBottom: '1px solid var(--border-subtle)',
                padding: '8px 16px',
              }}>
                <div style={{
                  fontSize: 'var(--md-sys-typescale-body-small-size)', fontWeight: 600,
                  color: 'var(--text-primary)',
                  fontFamily: 'JetBrains Mono, monospace',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  marginBottom: 2,
                }}>
                  {h.key}
                </div>
                <div style={{
                  fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-primary)',
                  fontFamily: 'JetBrains Mono, monospace',
                  wordBreak: 'break-all', lineHeight: 1.5,
                }}>
                  {h.value}
                </div>
              </div>
            );
          })}
          {!loading && parsedHeaders.length === 0 && (
            <pre style={{
              color: 'var(--text-primary)', fontSize: 'var(--md-sys-typescale-body-small-size)',
              fontFamily: 'JetBrains Mono, monospace',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              lineHeight: 1.6, margin: 0, padding: '12px 16px',
            }}>
              {headers || t('contextMenu.headers.noHeaders')}
            </pre>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'var(--overlay-scrim)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 5000, padding: 24,
      }}
    >
      <div ref={materialDialogRef} role="dialog" aria-modal="true" aria-label={t('contextMenu.headers.title')} className="material-modal" style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--md-sys-shape-corner-large)', width: '100%', maxWidth: 720,
        maxHeight: descaleCss('85vh'), display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-modal)',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('contextMenu.headers.title')}
            </div>
            <div style={{
              fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 2,
              maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {displaySubject}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <MaterialButton variant="text" selected={copied}
              onClick={handleCopy}
              style={{
                padding: '6px 12px', background: copied ? 'var(--accent-dim)' : 'var(--bg-tertiary)',
                border: `1px solid ${copied ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--md-sys-shape-corner-small)', color: copied ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: 'var(--md-sys-typescale-body-small-size)',
              }}
            >
              {copied ? t('contextMenu.headers.copied') : t('contextMenu.headers.copyRaw')}
            </MaterialButton>
            <MaterialButton variant="icon"
              type="button"
              onClick={onClose}
              aria-label={t('window.close')}
              title={t('window.close')}
              style={{
                background: 'none', border: 'none', padding: 6,
                color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 'var(--md-sys-shape-corner-small)',
                display: 'flex', alignItems: 'center',
              }}
            >
              <MaterialIcon name="close" />
            </MaterialButton>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {loading && (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--md-sys-typescale-body-medium-size)' }}>{t('contextMenu.headers.loading')}</div>
          )}

          {!loading && parsedHeaders.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--md-sys-typescale-body-small-size)' }}>
              <tbody>
                {parsedHeaders.map((h, i) => {
                  return (
                    <tr key={i} style={{
                      borderBottom: '1px solid var(--border-subtle)',
                    }}>
                      <td style={{
                        padding: '6px 12px 6px 0', verticalAlign: 'top',
                        color: 'var(--text-primary)',
                        fontWeight: 600,
                        whiteSpace: 'nowrap', width: 200, fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 'var(--md-sys-typescale-body-small-size)',
                      }}>
                        {h.key}
                      </td>
                      <td style={{
                        padding: '6px 0', color: 'var(--text-primary)',
                        wordBreak: 'break-all', fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 'var(--md-sys-typescale-body-small-size)', lineHeight: 1.6,
                      }}>
                        {h.value}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {!loading && parsedHeaders.length === 0 && (
            <pre style={{
              color: 'var(--text-primary)', fontSize: 'var(--md-sys-typescale-body-small-size)',
              fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre-wrap',
              lineHeight: 1.6, margin: 0,
            }}>
              {headers || t('contextMenu.headers.noHeaders')}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}