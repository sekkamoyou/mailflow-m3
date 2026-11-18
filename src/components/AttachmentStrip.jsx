import { MaterialIcon } from '../material/controls.jsx';
import { MaterialButton } from '../material/controls.jsx';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AttachmentViewer from './AttachmentViewer.jsx';
import { classifyAttachmentRisk } from '../utils/attachmentRisk.js';
import { previewKind } from '../utils/attachmentPreview.js';
import { fileIcon, formatBytes } from '../utils/attachmentUi.jsx';

// riskArmed value for the "Download all" link. A Symbol, so no attachment part can ever equal it.
const DOWNLOAD_ALL = Symbol('download-all');

// The attachments strip: `messageId` + `attachments` (the array the GET
// /api/mail/messages/:id response carries). One component for every view that shows a
// fetched message body — the reading pane (MessagePane) and the conversation-view card,
// which fetched the same response but dropped the files entirely (#634). Same chips, risk
// arming, "Download all" and in-app preview everywhere; state is self-contained, and the
// caller keys it by message id so navigating away resets a half-confirmed download.
// `style` lands on the root when the surrounding layout owes the strip a margin of its own
// (the reading pane's wrapper keeps its own spacing; the card adds the top margin).
export default function AttachmentStrip({ messageId, attachments, style }) {
  const { t } = useTranslation();
  const [riskArmed, setRiskArmed] = useState(null);
  const [downloadingPart, setDownloadingPart] = useState(null);
  const [viewerStart, setViewerStart] = useState(null);

  const list = attachments || [];
  const previewable = list.filter(att => previewKind(att));
  // "Download all" hands over every file at once, so it asks first whenever one of them would. While
  // it does, the link has no href, so a right-click "Save link as", a middle click or a long press has
  // nothing to fetch; the confirming click starts the download itself.
  const anyRiskyAttachment = list.some(att =>
    ['block', 'warn'].includes(classifyAttachmentRisk(att.filename, att.type).level));
  const downloadAllArmed = riskArmed === DOWNLOAD_ALL;
  const downloadAllUrl = `/api/mail/messages/${messageId}/attachments.zip`;
  const confirmDownloadAll = () => {
    if (!downloadAllArmed) { setRiskArmed(DOWNLOAD_ALL); return; }
    setRiskArmed(null);
    const a = document.createElement('a');
    a.href = downloadAllUrl;
    // download, not navigation: an error body (413 over the size cap, 404, an
    // expired session) must fail in the downloads panel, not replace the app.
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownload = async (part, filename) => {
    setDownloadingPart(part);
    try {
      const res = await fetch(`/api/mail/messages/${messageId}/attachments/${encodeURIComponent(part)}`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setDownloadingPart(null);
    }
  };

  if (!list.length) return null;

  return (
    <div style={style}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', fontWeight: 500 }}>
          {t('message.attachment', { count: list.length })}
        </div>
        {list.length > 1 && (
          <a
            {...(anyRiskyAttachment ? {
              role: 'button',
              tabIndex: 0,
              onClick: confirmDownloadAll,
              onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); confirmDownloadAll(); } },
            } : { href: downloadAllUrl, download: true })}
            style={{
              fontSize: 'var(--md-sys-typescale-body-small-size)', color: downloadAllArmed ? 'var(--red)' : 'var(--accent)', textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
            }}
          >
            <MaterialIcon name="download" />
            {downloadAllArmed
              ? t('message.attachmentRisk.armed', { label: t('message.downloadAll') })
              : t('message.downloadAll')}
          </a>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {list.map((att, i) => {
          const risk = classifyAttachmentRisk(att.filename, att.type);
          const risky = risk.level === 'block' || risk.level === 'warn';
          const riskColor = risk.level === 'block' ? 'var(--red)' : risk.level === 'warn' ? 'var(--amber)' : 'var(--text-tertiary)';
          const armed = riskArmed === att.part;
          const canPreview = previewable.includes(att);
          const riskText = risk.level === 'ok' ? '' : risk.doubleExt
            ? t('message.attachmentRisk.doubleExt', { ext: risk.doubleExt })
            : t(`message.attachmentRisk.${risk.level}`, { ext: risk.ext });
          return (
          <MaterialButton variant="card"
            key={i}
            title={canPreview ? t('message.preview.open') : undefined}
            onClick={() => {
              if (risky && !armed) { setRiskArmed(att.part); return; }
              setRiskArmed(null);
              if (canPreview) { setViewerStart(previewable.indexOf(att)); return; }
              handleDownload(att.part, att.filename);
            }}
            disabled={downloadingPart === att.part}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', borderRadius: 'var(--md-sys-shape-corner-small)',
              background: 'var(--bg-secondary)',
              border: `1px solid ${risky ? riskColor : 'var(--border)'}`,
              cursor: downloadingPart === att.part ? 'wait' : 'pointer',
              color: 'var(--text-primary)',
              transition: 'background 0.1s',
              maxWidth: 240,
            }}
            
            
          >
            <span style={{ display: 'flex', flexShrink: 0, color: 'var(--text-secondary)' }}>{fileIcon(att.type)}</span>
            <div style={{ minWidth: 0, textAlign: 'left' }}>
              <div style={{
                fontSize: 'var(--md-sys-typescale-body-small-size)', fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {att.filename}
              </div>
              <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)' }}>
                {downloadingPart === att.part ? t('message.downloading') : formatBytes(att.size)}
              </div>
              {risk.level !== 'ok' && (
                <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: riskColor, fontWeight: risk.level === 'block' ? 600 : 400, whiteSpace: 'normal' }}>
                  {armed ? t('message.attachmentRisk.armed', { label: riskText }) : riskText}
                </div>
              )}
            </div>
            <MaterialIcon name="download" />
          </MaterialButton>
          );
        })}
      </div>
      {viewerStart !== null && previewable.length > 0 && (
        <AttachmentViewer
          key={`${messageId}:${viewerStart}`}
          messageId={messageId}
          attachments={previewable}
          startIndex={viewerStart}
          onClose={() => setViewerStart(null)}
          onDownloadFallback={att => handleDownload(att.part, att.filename)}
        />
      )}
    </div>
  );
}
