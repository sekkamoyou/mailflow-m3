import { MaterialInput, MaterialButton } from '../material/controls.jsx';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/index.js';
import { api } from '../utils/api.js';
import { MaterialIcon } from '../material/controls.jsx';
import { useModalFocus } from '../material/useModalFocus.js';

export default function LockScreen() {
  const { t } = useTranslation();
  const { user, setLocked, loadPreferences, signOut } = useStore();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const dialogRef = useModalFocus();

  // The same sign-out as the sidebar's: it clears this user's mailbox state and follows the
  // SSO end-session URL when there is one, which this screen used to drop (#523).
  function handleSignOut() {
    setSigningOut(true);
    signOut();
  }

  async function handleUnlock(e) {
    e.preventDefault();
    if (pin.length < 4) return;
    setUnlocking(true);
    setError('');
    try {
      await api.unlock(pin);
      setLocked(false);
      // A locked cold-load skips loadPreferences (the API was 423'd); load server-only
      // settings now so they apply for the rest of the session (#235).
      loadPreferences();
    } catch (err) {
      // Lockout: api.unlock already dispatched session_expired (server destroyed the
      // session), which routes to login — nothing more to do here.
      if (err?.signedOut) return;
      const msg = err?.message || '';
      setError(msg === 'Incorrect PIN' ? t('lockScreen.wrongPin') : (msg || t('lockScreen.wrongPin')));
      setPin('');
    } finally {
      setUnlocking(false);
    }
  }

  const initials = ((user?.displayName || user?.username || '?')[0]).toUpperCase();

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('lockScreen.subtitle')} className="material-lock" style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'var(--bg-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
      animation: 'backdrop-enter 0.25s ease',
    }}>
      <div style={{
        width: '100%', maxWidth: 340,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
        animation: 'modal-enter 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        {/* Lock icon */}
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-secondary)',
        }}>
          <MaterialIcon name="lock" />
        </div>

        {/* User info */}
        <div style={{ textAlign: 'center' }}>
          {user?.avatar ? (
            <img src={user.avatar} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', marginBottom: 8 }} />
          ) : (
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'var(--accent)', color: 'var(--accent-text)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 'var(--md-sys-typescale-title-large-size)', fontWeight: 700, margin: '0 auto 8px',
            }}>
              {initials}
            </div>
          )}
          <div style={{ fontWeight: 600, fontSize: 'var(--md-sys-typescale-body-large-size)', color: 'var(--text-primary)' }}>
            {user?.displayName || user?.username}
          </div>
          <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-secondary)', marginTop: 4 }}>
            {t('lockScreen.subtitle')}
          </div>
        </div>

        {/* Unlock form */}
        <form onSubmit={handleUnlock} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MaterialInput
            aria-label={t('lockScreen.pinPlaceholder')}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
            placeholder={t('lockScreen.pinPlaceholder')}
            disabled={unlocking}
            style={{
              width: '100%', padding: '10px 12px',
              background: 'var(--bg-secondary)', border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 'var(--md-sys-shape-corner-small)', color: 'var(--text-primary)', fontSize: 'var(--md-sys-typescale-body-large-size)',
              outline: 'none', boxSizing: 'border-box',
              textAlign: 'center', letterSpacing: '0.3em',
            }}
          />
          {error && (
            <div role="alert" style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--red)', textAlign: 'center' }}>{error}</div>
          )}
          <MaterialButton variant="filled"
            type="submit"
            disabled={unlocking || pin.length < 4}
            style={{
              width: '100%', padding: '10px 0',
              background: 'var(--accent)', color: 'var(--accent-text)', border: 'none',
              borderRadius: 'var(--md-sys-shape-corner-small)', fontWeight: 600, fontSize: 'var(--md-sys-typescale-body-medium-size)',
              cursor: (unlocking || pin.length < 4) ? 'not-allowed' : 'pointer',
              opacity: (unlocking || pin.length < 4) ? 0.7 : 1,
            }}
          >
            {unlocking ? t('lockScreen.unlocking') : t('lockScreen.unlockButton')}
          </MaterialButton>
        </form>

        {/* Sign out */}
        <MaterialButton variant="text"
          onClick={handleSignOut}
          disabled={signingOut}
          style={{
            background: 'none', border: 'none',
            color: 'var(--text-tertiary)', fontSize: 'var(--md-sys-typescale-body-medium-size)',
            cursor: signingOut ? 'not-allowed' : 'pointer',
            padding: 0, opacity: signingOut ? 0.5 : 1,
          }}
        >
          {signingOut ? t('lockScreen.signingOut') : t('lockScreen.signOut')}
        </MaterialButton>
      </div>
    </div>
  );
}
