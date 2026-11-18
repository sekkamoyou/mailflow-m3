import { useModalFocus } from '../material/useModalFocus.js';
import { MaterialIcon } from '../material/controls.jsx';
import { MaterialButton, MaterialInput } from '../material/controls.jsx';
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/index.js';
import { api } from '../utils/api.js';

function resizeImage(file, maxPx = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function ProfileModal({ onClose }) {
  const materialDialogRef = useModalFocus({ onEscape: onClose });
  const { t } = useTranslation();
  const { user, updateUser } = useStore();
  const fileRef = useRef(null);

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || null);
  const [pendingAvatar, setPendingAvatar] = useState(null); // base64 to upload, or false = delete
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('profile.errorNotImage'));
      return;
    }
    try {
      const dataUrl = await resizeImage(file);
      setAvatarPreview(dataUrl);
      setPendingAvatar(dataUrl);
      setError('');
    } catch {
      setError(t('profile.errorProcess'));
    }
  }

  function handleRemoveAvatar() {
    setAvatarPreview(null);
    setPendingAvatar(false);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const trimmed = displayName.trim().slice(0, 100);
      if (trimmed !== (user?.displayName || '')) {
        await api.updateProfile({ displayName: trimmed });
        updateUser({ displayName: trimmed || null });
      }
      if (pendingAvatar === false) {
        await api.deleteAvatar();
        updateUser({ avatar: null });
      } else if (pendingAvatar) {
        await api.uploadAvatar(pendingAvatar);
        updateUser({ avatar: pendingAvatar });
      }
      onClose();
    } catch (err) {
      setError(err.message || t('common.error', { message: '' }));
    } finally {
      setSaving(false);
    }
  }

  const initials = ((user?.displayName || user?.username || '?')[0]).toUpperCase();

  // Rendered through a portal to document.body. This modal is mounted from inside the
  // sidebar, and on mobile the sidebar is a drawer hidden with transform: translateX(-100%).
  // A transformed ancestor is the containing block for position: fixed descendants, so
  // without the portal the "fullscreen" overlay is trapped inside the drawer and slides
  // off-screen with it the moment the menu closes: the user taps Edit Profile and sees
  // nothing happen, and reopening the drawer shows the modal already open inside it (#455).
  // Settings never had this bug because it renders at the MailApp level; the portal gives
  // this modal the same escape without moving its state.
  return createPortal(
    <div className="material-modal-scrim"
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        WebkitBackdropFilter: 'blur(6px)',
        zIndex: 3000,
      }}
    >
      <div ref={materialDialogRef} role="dialog" aria-modal="true" aria-label={t('profile.title')} className="material-modal material-dialog-frame" style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--md-sys-shape-corner-large)', width: '100%', maxWidth: 400,
        boxShadow: 'var(--shadow-modal)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div className="material-dialog-header">
          <h2>
            {t('profile.title')}
          </h2>
          <MaterialButton variant="icon"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4, display: 'flex' }}
          >
            <MaterialIcon name="close" />
          </MaterialButton>
        </div>

        {/* Body */}
        <div className="material-dialog-body"><div className="material-dialog-content">
          {/* Avatar */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt=""
                  style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 'var(--md-sys-typescale-headline-medium-size)', fontWeight: 700, color: 'var(--accent-text)',
                }}>
                  {initials}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <MaterialButton variant="outlined"
                onClick={() => fileRef.current?.click()}
                style={{
                  fontSize: 'var(--md-sys-typescale-body-small-size)', padding: '5px 12px', borderRadius: 'var(--md-sys-shape-corner-small)', border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: 'pointer',
                }}
              >
                {t('profile.uploadPhoto')}
              </MaterialButton>
              {avatarPreview && (
                <MaterialButton variant="outlined"
                  onClick={handleRemoveAvatar}
                  style={{
                    fontSize: 'var(--md-sys-typescale-body-small-size)', padding: '5px 12px', borderRadius: 'var(--md-sys-shape-corner-small)', border: '1px solid var(--border)',
                    background: 'transparent', color: 'var(--red, #f87171)', cursor: 'pointer',
                  }}
                >
                  {t('profile.removePhoto')}
                </MaterialButton>
              )}
            </div>
            <MaterialInput
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>

          {/* Display name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', fontWeight: 500, color: 'var(--text-secondary)' }}>
              {t('profile.displayName')}
            </label>
            <MaterialInput
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder={user?.username || ''}
              maxLength={100}
              style={{
                padding: '8px 10px', borderRadius: 'var(--md-sys-shape-corner-small)', border: '1px solid var(--border)',
                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                fontSize: 'var(--md-sys-typescale-body-medium-size)', outline: 'none', width: '100%', boxSizing: 'border-box',
              }}
            />
            <span style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)' }}>
              {t('profile.displayNameHint')}
            </span>
          </div>

          {error && (
            <div style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--red, #f87171)', padding: '8px 10px', borderRadius: 'var(--md-sys-shape-corner-small)', background: 'rgba(248,113,113,0.08)' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        </div>
        <div className="material-dialog-actions">
          <MaterialButton variant="outlined"
            onClick={onClose}
            style={{
              padding: '7px 16px', borderRadius: 'var(--md-sys-shape-corner-small)', border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 'var(--md-sys-typescale-body-medium-size)',
            }}
          >
            {t('common.cancel')}
          </MaterialButton>
          <MaterialButton variant="filled"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '7px 16px', borderRadius: 'var(--md-sys-shape-corner-small)', border: 'none',
              background: 'var(--accent)', color: 'var(--accent-text)', cursor: saving ? 'default' : 'pointer',
              fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 500, opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? t('common.saving') : t('common.save')}
          </MaterialButton>
        </div>
      </div>
    </div>,
    document.body
  );
}
