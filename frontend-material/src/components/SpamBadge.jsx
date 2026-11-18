import { MaterialIcon } from '../material/controls.jsx';
import { MaterialButton } from '../material/controls.jsx';
import { useTranslation } from 'react-i18next';

// Auto-spam badge shown next to a message subject when the classifier (not
// the user) flagged it as spam. Clicking opens the explain modal.
// Hidden when the user manually overrode the verdict (spam_user_override) —
// that's the user's own intent, not auto-classification.

export default function SpamBadge({ message, onClick }) {
  const { t } = useTranslation();
  const isAuto = message?.spam_verdict === 'spam' && !message?.spam_user_override;
  if (!isAuto) return null;

  const pct = message?.spam_score_ml != null
    ? Math.round((Number(message.spam_score_ml) || 0) * 100)
    : null;

  return (
    <MaterialButton variant="text"
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(message); }}
      title={t('spam.badgeTitle')}
      style={{
        flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', gap: 3,
        marginLeft: 6, padding: '2px 6px', borderRadius: 'var(--md-sys-shape-corner-small)',
        background: 'var(--danger-dim, rgba(220,38,38,.14))',
        color: 'var(--danger, #dc2626)',
        border: 'none', cursor: 'pointer',
        fontSize: 'var(--md-sys-typescale-body-small-size)', fontWeight: 600, lineHeight: 1.4,
        verticalAlign: 'middle',
      }}
    >
      <MaterialIcon name="report" />
      <span>{t('spam.badgeLabel')}</span>
      {pct != null ? ` ${pct}%` : null}
    </MaterialButton>
  );
}
