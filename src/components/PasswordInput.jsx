import { MaterialInput, MaterialButton } from '../material/controls.jsx';
import { useState } from 'react';
import { MaterialIcon } from '../material/controls.jsx';
import { useTranslation } from 'react-i18next';

// A password field with an eye button that shows what has been typed, so a long password can
// be checked before it is submitted. Takes every prop an <input> does; `type` is its own.
export default function PasswordInput({ style, className, ...props }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const label = visible ? t('login.hidePassword') : t('login.showPassword');
  return (
    <div style={{ position: 'relative' }}>
      {/* mf-password-input hides Edge's own reveal button (index.css), which would sit next to this one. */}
      <MaterialInput {...props} className={['mf-password-input', className].filter(Boolean).join(' ')}
        type={visible ? 'text' : 'password'} style={{ ...style, paddingRight: 42 }} />
      <MaterialButton variant="icon"
        type="button"
        onClick={() => setVisible(v => !v)}
        // Keeps the caret in the field when the eye is clicked with a mouse.
        onMouseDown={e => e.preventDefault()}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        style={{
          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6,
          background: 'none', border: 'none', borderRadius: 'var(--md-sys-shape-corner-small)', cursor: 'pointer',
          color: 'var(--text-tertiary)',
        }}
      >
        <MaterialIcon name={visible ? "visibility_off" : "visibility"} size={20} />
      </MaterialButton>
    </div>
  );
}
