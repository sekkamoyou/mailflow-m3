import { useModalFocus } from '../material/useModalFocus.js';
import { MaterialInput, MaterialButton } from '../material/controls.jsx';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../utils/api.js';
import PasswordInput from './PasswordInput.jsx';
import { formatRelativeTime } from '../utils/relativeTime.js';
import { htmlLang } from '../utils/browserLanguage.js';

// Lets an admin change another user's sign-in name, recovery email and password: the way back
// in for someone who forgot their password and never set a recovery email. It also lists the
// single sign-on accounts linked to the user, so one the user didn't add can be unlinked (#714).
export default function AdminUserEditor({ user, isSelf, onClose, onSaved, onChanged }) {
  const { t, i18n } = useTranslation();
  const [identities, setIdentities] = useState([]);
  const [confirmUnlink, setConfirmUnlink] = useState(null);
  const [unlinking, setUnlinking] = useState(false);
  const [identityError, setIdentityError] = useState(null);

  useEffect(() => {
    let live = true;
    api.admin.getUserIdentities(user.id)
      .then(data => { if (live) setIdentities(data.identities || []); })
      .catch(() => {});
    return () => { live = false; };
  }, [user.id]);

  const unlink = async identity => {
    if (confirmUnlink !== identity.id) { setConfirmUnlink(identity.id); return; }
    setUnlinking(true);
    setIdentityError(null);
    try {
      await api.admin.unlinkUserIdentity(user.id, identity.id);
      setIdentities(list => list.filter(i => i.id !== identity.id));
    } catch (err) {
      setIdentityError(t('admin.users.identityUnlinkFailed', { message: err?.message || '' }));
    } finally {
      setUnlinking(false);
      setConfirmUnlink(null);
    }
  };
  const [username, setUsername] = useState(user.username);
  const [recoveryEmail, setRecoveryEmail] = useState(user.recoveryEmail || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const dialogRef = useModalFocus({ onEscape: () => { if (!saving) onClose(); } });

  const save = async e => {
    e.preventDefault();
    setError(null);
    if (password && password.length < 8) { setError(t('admin.users.passwordTooShort')); return; }
    if (password && password !== confirm) { setError(t('admin.users.passwordMismatch')); return; }

    const changes = {};
    const nextUsername = username.trim().toLowerCase();
    if (nextUsername !== user.username) changes.username = nextUsername;
    const nextEmail = recoveryEmail.trim().toLowerCase();
    if (nextEmail !== (user.recoveryEmail || '')) changes.recoveryEmail = nextEmail;
    if (!Object.keys(changes).length && !password) { onClose(); return; }

    const errorText = err => {
      const message = err?.message || '';
      return message === 'Username already taken' ? t('admin.users.usernameTaken')
        : message === 'Invalid email address' ? t('admin.users.invalidEmail')
          : t('admin.users.saveFailed', { message });
    };
    setSaving(true);
    try {
      let updated = user;
      if (Object.keys(changes).length) {
        await api.admin.updateUser(user.id, changes);
        updated = { ...user, username: changes.username ?? user.username, recoveryEmail: changes.recoveryEmail ?? user.recoveryEmail };
      }
      if (password) {
        try {
          await api.admin.setUserPassword(user.id, password);
        } catch (err) {
          // The name and email are already saved. Show them in the list, and keep the dialog open
          // so the password can be tried again without sending those changes a second time.
          if (updated !== user) {
            onChanged?.(updated);
            setError(t('admin.users.passwordNotSet', { message: err?.message || '' }));
          } else {
            setError(errorText(err));
          }
          return;
        }
      }
      onSaved(updated);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const input = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, fontSize: 13,
    background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)', outline: 'none',
  };
  const label = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 };
  const hint = { fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.4 };

  return createPortal(
    <div className="material-modal-scrim"
      onClick={e => e.target === e.currentTarget && !saving && onClose()}
      style={{
        zIndex: 3000,
      }}
    >
      <form ref={dialogRef} className="material-modal material-dialog-frame"
        onSubmit={save}
        role="dialog"
        aria-modal="true"
        aria-label={t('admin.users.editTitle', { username: user.username })}
        autoComplete="off"
        style={{
          width: '100%', maxWidth: 420, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 'var(--md-sys-shape-corner-large)', boxShadow: 'var(--shadow-modal)',
        }}
      >
        <header className="material-dialog-header"><h2>{t('admin.users.editTitle', { username: user.username })}</h2></header>
        <div className="material-dialog-body"><div className="material-dialog-content">

        <div>
          <label style={label} htmlFor="admin-user-username">{t('admin.users.username')}</label>
          <MaterialInput id="admin-user-username" style={input} value={username} autoComplete="off"
            onChange={e => setUsername(e.target.value)} />
          <div style={hint}>{t('admin.users.usernameHint')}</div>
        </div>

        <div>
          <label style={label} htmlFor="admin-user-recovery">{t('admin.users.recoveryEmail')}</label>
          <MaterialInput id="admin-user-recovery" type="email" style={input} value={recoveryEmail} autoComplete="off"
            placeholder={t('admin.security.recoveryEmailPh')}
            onChange={e => setRecoveryEmail(e.target.value)} />
          <div style={hint}>{t('admin.users.recoveryEmailHint')}</div>
        </div>

        <div>
          <label style={label} htmlFor="admin-user-password">{t('admin.users.newPassword')}</label>
          {/* new-password: stops the browser filling in the admin's own saved password here. */}
          <PasswordInput id="admin-user-password" style={input} value={password} autoComplete="new-password"
            onChange={e => setPassword(e.target.value)} />
          {password && (
            <div style={{ marginTop: 8 }}>
              <PasswordInput aria-label={t('admin.users.confirmPassword')} placeholder={t('admin.users.confirmPassword')}
                style={input} value={confirm} autoComplete="new-password" onChange={e => setConfirm(e.target.value)} />
            </div>
          )}
          <div style={hint}>{isSelf ? t('admin.users.newPasswordHintSelf') : t('admin.users.newPasswordHint')}</div>
          {identities.length > 0 && <div style={hint}>{t('admin.users.newPasswordRemovesIdentities')}</div>}
        </div>

        {identities.length > 0 && (
          <div>
            <div style={label}>{t('admin.users.identitiesTitle')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {identities.map(identity => (
                <div key={identity.id} data-identity={identity.id} className="material-identity-row" style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8,
                  background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {identity.provider_name}{identity.email ? ` · ${identity.email}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {identity.last_used_at
                        ? t('admin.users.identityLastUsed', { when: formatRelativeTime(identity.last_used_at, htmlLang(i18n.language)) })
                        : t('admin.users.identityNeverUsed')}
                    </div>
                  </div>
                  <MaterialButton type="button" onClick={() => unlink(identity)} disabled={unlinking} style={{
                    padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, flexShrink: 0,
                    border: '1px solid var(--border)', background: 'transparent', cursor: unlinking ? 'wait' : 'pointer',
                    color: confirmUnlink === identity.id ? 'var(--red)' : 'var(--text-secondary)',
                  }}>
                    {confirmUnlink === identity.id ? t('admin.users.unlinkIdentityConfirm') : t('admin.users.unlinkIdentity')}
                  </MaterialButton>
                </div>
              ))}
            </div>
            <div style={hint}>{t('admin.users.identitiesHint')}</div>
            {identityError && <div role="alert" style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{identityError}</div>}
          </div>
        )}

        {error && <div role="alert" style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}

        </div></div>
        <div className="material-dialog-actions">
          <MaterialButton variant="outlined" type="button" onClick={onClose} disabled={saving} style={{
            padding: '8px 14px', borderRadius: 'var(--md-sys-shape-corner-small)', fontSize: 'var(--md-sys-typescale-body-medium-size)', cursor: 'pointer',
            background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border)',
          }}>
            {t('common.cancel')}
          </MaterialButton>
          <MaterialButton variant="filled" type="submit" disabled={saving} style={{
            padding: '8px 16px', borderRadius: 'var(--md-sys-shape-corner-small)', fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 500, border: 'none',
            background: 'var(--accent)', color: '#fff', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
          }}>
            {saving ? t('common.saving') : t('common.save')}
          </MaterialButton>
        </div>
      </form>
    </div>,
    document.body,
  );
}
