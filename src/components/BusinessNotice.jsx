import { MaterialButton } from '../material/controls.jsx';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/index.js';
import { api } from '../utils/api.js';

const PRICING_URL = 'https://mailflow.sh/#pricing';

// Asks admins of an instance that looks like a business to consider the voluntary business
// license. The server decides whether it is due (user count, single sign-on, earlier answers);
// the browser only reads that answer and stores the admin's choice. Silent on any failure.
export default function BusinessNotice({ hidden = false }) {
  const { t } = useTranslation();
  const isAdmin = useStore(s => !!s.user?.isAdmin);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    api.admin.getBusinessNotice()
      .then(d => { if (!cancelled && d?.show) setShow(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAdmin]);

  if (!isAdmin || !show || hidden) return null;

  const choose = (choice) => {
    setShow(false);
    api.admin.setBusinessNotice(choice).catch(() => {});
  };

  const button = {
    background: 'none', border: '1px solid var(--border)', borderRadius: 5,
    padding: '4px 9px', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)',
    cursor: 'pointer', fontFamily: 'inherit',
  };

  return (
    <div
      role="region"
      aria-label={t('admin.businessNotice.title')}
      data-testid="business-notice" className="material-business-notice"
      style={{
        position: 'fixed', right: 'calc(16px / var(--ui-scale, 1))', bottom: 'calc((var(--sab, 0px) + 16px) / var(--ui-scale, 1))', zIndex: 2500,
        width: 'min(340px, calc(100% - 32px / var(--ui-scale, 1)))', boxSizing: 'border-box',
        maxHeight: 'calc((var(--app-height, 100dvh) - var(--sat, 0px) - var(--sab, 0px) - 32px) / var(--ui-scale, 1))', overflowY: 'auto',
        padding: '14px 16px', borderRadius: 'var(--md-sys-shape-corner-medium)',
        background: 'var(--md-sys-color-surface-container-high)', border: '1px solid var(--border)',
        borderLeft: '3px solid var(--accent)', boxShadow: 'var(--md-sys-elevation-level3)',
        color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.5,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
        {t('admin.businessNotice.title')}
      </div>
      <p style={{ margin: '0 0 12px' }}>{t('admin.businessNotice.body')}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <a
          href={PRICING_URL}
          target="_blank"
          rel="noopener noreferrer" className="md-button" data-variant="filled"
        >
          {t('admin.businessNotice.learnMore')}
        </a>
        <MaterialButton type="button" style={button} onClick={() => choose('licensed')}>
          {t('admin.businessNotice.haveOne')}
        </MaterialButton>
        <MaterialButton type="button" style={button} onClick={() => choose('not_business')}>
          {t('admin.businessNotice.notBusiness')}
        </MaterialButton>
        <MaterialButton type="button" style={button} onClick={() => choose('later')}>
          {t('admin.businessNotice.later')}
        </MaterialButton>
      </div>
    </div>
  );
}
