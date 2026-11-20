import { HeaderTags } from '../tags/TagControls.jsx';
import { useTranslation } from 'react-i18next';
import { PluginSlot } from '../plugins/PluginSlot.jsx';
import { useStore } from '../store/index.js';
import AccountMark from './AccountMark.jsx';
import MessageClassification from './MessageClassification.jsx';
import SpamBadge from './SpamBadge.jsx';
import SenderAvatarImage from './SenderAvatarImage.jsx';
import { MaterialIcon } from '../material/controls.jsx';
import { senderColor } from '../themes.js';
import { formatMessageDateTime } from '../utils/formatDate.js';

// Shared by the open message and its swipe preview; neither schedules a read or performs actions.
export default function MessageSenderCard({ message, body, isMobile, resolvedSubject, onSpamExplain }) {
  const { t } = useTranslation();
  const account = useStore(state => state.accounts.find(item => item.id === message.account_id));
  const addresses = value => {
    try { return Array.isArray(value) ? value : JSON.parse(value || '[]'); }
    catch { return []; }
  };
  const toList = addresses(message.to_addresses);
  const ccList = addresses(message.cc_addresses);
  const bccList = Array.isArray(body?.bccAddresses) ? body.bccAddresses : [];
  return (
    <div className="msg-card material-sender-card" style={{
      marginBottom: isMobile ? 12 : 24,
      marginLeft: isMobile ? 0 : undefined,
      marginRight: isMobile ? 0 : undefined,
      background: 'var(--bg-secondary)',
      borderRadius: isMobile ? 0 : 10,
      border: isMobile ? 'none' : '1px solid var(--border-subtle)',
      borderBottom: '1px solid var(--border-subtle)',
      borderLeft: message?.account_color ? `3px solid ${message.account_color}` : undefined,
      overflow: 'hidden',
      boxShadow: isMobile ? 'none' : 'var(--shadow-soft), inset 0 1px 0 rgba(255,255,255,0.04)',
    }}>
      {/* Subject */}
      <div className="material-message-subject" style={{
        padding: '14px 16px 12px',
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: 'var(--md-sys-typescale-body-large-size)', fontWeight: 600,
        color: 'var(--text-primary)', lineHeight: 1.3,
        fontFamily: 'var(--font-display)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <span>
            {(() => {
              const paneSubject = resolvedSubject || message.subject;
              return (paneSubject && paneSubject !== '(no subject)')
                ? paneSubject
                : t('message.noSubject');
            })()}
          </span>
          <MessageClassification message={message} />
          <SpamBadge message={message} onClick={(m) => onSpamExplain?.(m.id)} />
          <HeaderTags key={message.id} messageId={message.id} />
          <PluginSlot name="message-header-meta" ctx={{ message, account }} />
        </div>
      </div>

      <div className="material-sender-details">
        {/* Avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
          background: senderColor(message.from_email || message.from_name),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 'var(--md-sys-typescale-body-large-size)', fontWeight: 700, color: 'white',
          position: 'relative', overflow: 'hidden',
        }}>
          {(message.from_name || message.from_email || '?')[0].toUpperCase()}
          <SenderAvatarImage
            email={message.from_email}
            hasContactPhoto={message.has_contact_photo}
          />
        </div>

        {/* Sender info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isMobile ? (
            <>
              <div style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {message.from_name || message.from_email}
              </div>
              {message.from_name && (
                <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {message.from_email}
                </div>
              )}
              {body?.senderEmail && (
                <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span>{t('message.via')} </span>
                  <span style={{ color: 'var(--text-secondary)' }}>{body.senderName ? `${body.senderName} <${body.senderEmail}>` : body.senderEmail}</span>
                </div>
              )}
              {body?.forwardedFromEmail && (
                <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span>{t('message.forwardedFrom', { service: body.forwardedVia })} </span>
                  <span style={{ color: 'var(--text-secondary)' }}>{body.forwardedFromName ? `${body.forwardedFromName} <${body.forwardedFromEmail}>` : body.forwardedFromEmail}</span>
                </div>
              )}
              <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span>{t('message.to')} </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {toList.length > 0
                    ? toList.map((r, i) => (
                        <span key={i}>{r.name || r.email}{i < toList.length - 1 ? ', ' : ''}</span>
                      ))
                    : (message.account_email || message.account_name || '')}
                </span>
              </div>
              {ccList.length > 0 && (
                <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span>Cc </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {ccList.map((r, i) => (
                      <span key={i}>{r.name || r.email}{i < ccList.length - 1 ? ', ' : ''}</span>
                    ))}
                  </span>
                </div>
              )}
              {bccList.length > 0 && (
                <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span>Bcc </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {bccList.map((r, i) => (
                      <span key={i}>{r.name || r.email}{i < bccList.length - 1 ? ', ' : ''}</span>
                    ))}
                  </span>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {message.from_name || message.from_email}
                </span>
                {message.from_name && (
                  <span style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)' }}>
                    &lt;{message.from_email}&gt;
                  </span>
                )}
              </div>
              {body?.senderEmail && (
                <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 3 }}>
                  <span>{t('message.via')} </span>
                  <span style={{ color: 'var(--text-secondary)' }}>{body.senderName ? `${body.senderName} <${body.senderEmail}>` : body.senderEmail}</span>
                </div>
              )}
              {body?.forwardedFromEmail && (
                <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 3 }}>
                  <span>{t('message.forwardedFrom', { service: body.forwardedVia })} </span>
                  <span style={{ color: 'var(--text-secondary)' }}>{body.forwardedFromName ? `${body.forwardedFromName} <${body.forwardedFromEmail}>` : body.forwardedFromEmail}</span>
                </div>
              )}
              <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 3 }}>
                <span>{t('message.to')} </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {toList.length > 0
                    ? toList.map((r, i) => (
                        <span key={i}>
                          {r.name ? `${r.name} <${r.email}>` : r.email}
                          {i < toList.length - 1 ? ', ' : ''}
                        </span>
                      ))
                    : (message.account_email || message.account_name || '')}
                </span>
              </div>
              {ccList.length > 0 && (
                <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                  <span>Cc </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {ccList.map((r, i) => (
                      <span key={i}>
                        {r.name ? `${r.name} <${r.email}>` : r.email}
                        {i < ccList.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {bccList.length > 0 && (
                <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 2 }}>
                  <span>Bcc </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {bccList.map((r, i) => (
                      <span key={i}>
                        {r.name ? `${r.name} <${r.email}>` : r.email}
                        {i < bccList.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Date + account */}
        <div className="material-sender-date" style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
            {formatMessageDateTime(message.date, { withYear: !isMobile })}
          </div>
          <div style={{
            fontSize: 'var(--md-sys-typescale-body-small-size)', marginTop: 4,
            display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end',
          }}>
            <AccountMark accountId={message.account_id} color={message.account_color || 'var(--accent)'} size={6} />
            <span style={{ color: 'var(--text-tertiary)' }}>{message.account_name}</span>
          </div>
          {/* With images allowed, open-tracking images are still never loaded (the backend's
              image proxy): how many, with the email's other facts. */}
          {!body?.hasBlockedRemoteImages && body?.trackersBlocked > 0 && (
            <div title={t('message.trackersBlockedHint')} style={{
              fontSize: 'var(--md-sys-typescale-body-small-size)', marginTop: 4, marginLeft: 'auto', maxWidth: 170,
              display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end',
              color: 'var(--text-tertiary)',
            }}>
              <MaterialIcon name="shield" />
              <span>{t('message.trackersBlocked', { count: body.trackersBlocked })}</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
