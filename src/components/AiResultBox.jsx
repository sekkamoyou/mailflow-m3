import { MaterialIcon } from '../material/controls.jsx';
import { MaterialButton } from '../material/controls.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { renderMarkdown } from '../utils/renderMarkdown.js';
import { copyToClipboard } from '../utils/clipboard.js';

// A pinned AI result box shown above the message (#204). Collapsible to keep
// multiple results from crowding the view; offers regenerate and dismiss.
export default function AiResultBox({ result, canRegen, onRegen, onDismiss }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const loading = result.status === 'loading';
  const error = result.status === 'error';
  // Render the (markdown) AI output to sanitized HTML. Memoized on the text so toggling
  // expand/collapse doesn't re-parse; re-runs as text streams in during generation (#215).
  const html = useMemo(() => renderMarkdown(result.text || ''), [result.text]);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(copyTimerRef.current), []);
  // Copy the output to the clipboard as BOTH rich text (the rendered HTML) and source
  // (the raw markdown), so pasting into a rich editor gives formatting and pasting into a
  // plain field gives the markdown source (#215). Falls back to plain text where the async
  // clipboard / ClipboardItem isn't available (e.g. non-secure context).
  const handleCopy = async () => {
    const source = result.text || '';
    const flash = () => {
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    };
    try {
      if (navigator.clipboard?.write && window.ClipboardItem) {
        await navigator.clipboard.write([new window.ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([source], { type: 'text/plain' }),
        })]);
      } else {
        const { ok } = await copyToClipboard(source);
        if (!ok) return;
      }
      flash();
    } catch {
      // The rich path can fail on its own (no ClipboardItem, a rejected write). Fall back
      // to plain text through the shared helper, which also covers non-secure contexts
      // where navigator.clipboard does not exist at all.
      const { ok } = await copyToClipboard(source);
      if (ok) flash();
    }
  };
  const iconBtn = {
    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)',
    padding: '2px 4px', display: 'flex', alignItems: 'center', lineHeight: 1,
  };
  return (
    <div className="material-ai-result" style={{
      padding: '12px 16px', background: 'var(--bg-secondary)',
      border: '1px solid var(--border)', borderLeft: '3px solid var(--accent)',
      borderRadius: 'var(--md-sys-shape-corner-small)', fontSize: 'var(--md-sys-typescale-body-medium-size)', lineHeight: 1.55, color: 'var(--text-primary)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
        <span style={{
          flex: '1 1 64px', minWidth: 0,
          fontSize: 'var(--md-sys-typescale-body-small-size)', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase',
          letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {result.label}
        </span>
        <div className="material-ai-result-actions" style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginInlineStart: 'auto' }}>
          {/* Only once text is streaming in: until then the body below says it (#618). */}
          {loading && result.text && (
            <span style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', fontStyle: 'italic', marginRight: 4 }}>
              {t('compose.toolbar.aiGenerating')}
            </span>
          )}
          {canRegen && !loading && (
            <MaterialButton variant="icon" onClick={onRegen} title={t('message.aiRegenerate')} aria-label={t('message.aiRegenerate')} style={iconBtn}>
              <MaterialIcon name="sync" />
            </MaterialButton>
          )}
          {!error && !loading && result.text && (
            <MaterialButton variant="icon" onClick={handleCopy} title={copied ? t('message.aiCopied') : t('message.aiCopy')} aria-label={copied ? t('message.aiCopied') : t('message.aiCopy')} style={iconBtn}>
              {copied ? (
                <MaterialIcon name="check" />
              ) : (
                <MaterialIcon name="content_copy" />
              )}
            </MaterialButton>
          )}
          {!error && !loading && (
            <MaterialButton variant="icon" onClick={() => setExpanded(v => !v)} title={expanded ? t('message.aiCollapse') : t('message.aiExpand')} aria-label={expanded ? t('message.aiCollapse') : t('message.aiExpand')} style={iconBtn}>
              <MaterialIcon name="expand_more" />
            </MaterialButton>
          )}
          <MaterialButton variant="icon" onClick={onDismiss} aria-label={t('message.summaryDismiss')} style={iconBtn}>
            <MaterialIcon name="close" />
          </MaterialButton>
        </div>
      </div>
      {loading && !result.text ? (
        <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>{t('compose.toolbar.aiGenerating')}</span>
      ) : error ? (
        <span style={{ color: 'var(--red)' }}>{t('compose.toolbar.aiError', { message: result.text })}</span>
      ) : (
        <div
          className="ai-markdown"
          style={{ maxHeight: expanded ? 'none' : 220, overflowY: expanded ? 'visible' : 'auto' }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      {!error && result.truncated && (
        <div style={{ marginTop: 6, fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
          {t('message.aiTruncated', { percent: Math.max(1, Math.floor((100 * result.truncated.shown) / result.truncated.total)) })}
        </div>
      )}
    </div>
  );
}
