import { useTranslation } from 'react-i18next';
import { backendSourceUrl, frontendSourceUrl } from '../utils/sourceLinks.js';

export default function SourceNotice() {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', padding: '8px 14px', fontSize: 'var(--md-sys-typescale-body-small-size)' }}>
      <span>{t('admin.about.sourceCode')}</span>
      <a href={frontendSourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>MailFlow M3</a>
      <a href={backendSourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>MailFlow backend</a>
    </div>
  );
}
