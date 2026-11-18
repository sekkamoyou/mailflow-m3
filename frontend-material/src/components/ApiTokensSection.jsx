import { MaterialButton, MaterialInput, MaterialSelect } from '../material/controls.jsx';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/index.js';
import { api } from '../utils/api.js';
import { copyToClipboard, selectElementText } from '../utils/clipboard.js';
import { appLocale, formatDateTime, formatDay, formatTime } from '../utils/formatDate.js';
import PasswordInput from './PasswordInput.jsx';

// Personal API tokens (#617), in Settings → Security after two-factor. Self-contained, like
// ScreenLockSection. A new token's secret is kept in memory only: never in the store, browser
// storage, a log or a URL.

// The secret can never be shown again, so it is held here as well as in the card's state: the
// settings panel builds a new card when it switches between its phone and desktop layouts
// (turning a phone, snapping a window), changes tab or shows search results, and the token would
// be lost while the server still lists it. It goes on Done, or when the panel closes, the screen
// locks or the user changes.
let unseen = null; // { userId, name, token }
let securitySession = 0;
useStore.subscribe((state, previous) => {
  if ((!state.showAdmin && previous.showAdmin) || (state.isLocked && !previous.isLocked)
    || state.user?.id !== previous.user?.id) securitySession += 1;
  if (unseen && (!state.showAdmin || state.isLocked || (state.user?.id ?? null) !== unseen.userId)) unseen = null;
});

const SCOPES = [
  { id: 'read', label: 'admin.apiTokens.scopeReadLabel', desc: 'admin.apiTokens.scopeReadDesc' },
  { id: 'organize', label: 'admin.apiTokens.scopeOrganizeLabel', desc: 'admin.apiTokens.scopeOrganizeDesc' },
  { id: 'draft', label: 'admin.apiTokens.scopeDraftLabel', desc: 'admin.apiTokens.scopeDraftDesc' },
];
const SCOPE_LABELS = Object.fromEntries(SCOPES.map(s => [s.id, s.label]));

const NEW_FORM = { name: '', picked: { read: true, organize: false, draft: false }, expiry: undefined, code: '', password: '' };

// The server says which expiries it offers (fewer when single sign-on confirms the token), so the
// list is shown as given.
const defaultExpiry = (choices) => (choices.includes(90) ? 90 : choices.includes(30) ? 30 : choices[0]);
// "90 days" in the UI language, in the right plural form for any count the server sends.
const formatDays = (days) => new Intl.NumberFormat(appLocale(), { style: 'unit', unit: 'day', unitDisplay: 'long' }).format(days);

const cardStyle = {
  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  borderRadius: 12, padding: '20px 24px', marginBottom: 20,
};
const labelStyle = { display: 'block', fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-secondary)', marginBottom: 5 };
const inputStyle = {
  width: '100%', padding: '9px 12px',
  background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
  borderRadius: 7, color: 'var(--text-primary)', fontSize: 'var(--md-sys-typescale-body-medium-size)',
  outline: 'none', transition: 'border-color 0.15s', boxSizing: 'border-box',
};
const primaryButton = (disabled) => ({
  padding: '8px 16px', background: 'var(--accent)', border: 'none',
  borderRadius: 7, color: 'var(--accent-text)', fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 500,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, flexShrink: 0,
});
const secondaryButton = {
  padding: '8px 16px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
  borderRadius: 7, color: 'var(--text-secondary)', fontSize: 'var(--md-sys-typescale-body-medium-size)', cursor: 'pointer', flexShrink: 0,
};
const smallButton = (disabled) => ({
  padding: '5px 10px', fontSize: 'var(--md-sys-typescale-body-small-size)', borderRadius: 6, flexShrink: 0,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});
const errorBox = {
  padding: '10px 14px', background: 'var(--md-sys-color-error-container)',
  border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 8,
  color: 'var(--red)', fontSize: 'var(--md-sys-typescale-body-medium-size)',
};
const noticeBox = {
  padding: '8px 12px', borderRadius: 7, marginBottom: 14,
  background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)',
  fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-secondary)',
};
// overflowWrap: an IPv6 address in "last used from" is one word too wide for a phone's column.
const metaStyle = { fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 3, overflowWrap: 'anywhere' };
const hintStyle = { fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', lineHeight: 1.5 };

export default function ApiTokensSection() {
  const { t } = useTranslation();
  const userId = useStore(s => s.user?.id ?? null);
  const isAdmin = useStore(s => !!s.user?.isAdmin);
  const totpEnabled = useStore(s => !!s.user?.totpEnabled);
  const ids = useId();

  const [data, setData] = useState(null); // { enabled, reauth, oidc?, maxTokens, expiryChoices, tokens }
  const [loadError, setLoadError] = useState('');
  const loadSeq = useRef(0);

  const [switchBusy, setSwitchBusy] = useState(false);
  const [switchError, setSwitchError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(NEW_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [secret, setSecret] = useState(() => unseen); // { userId, name, token }
  const shown = secret?.userId === userId ? secret : null;
  const [copyResult, setCopyResult] = useState(null); // null | 'copied' | 'failed'
  const secretRef = useRef(null);

  const [confirmingId, setConfirmingId] = useState(null);
  const [revokingId, setRevokingId] = useState(null);
  const [revokeError, setRevokeError] = useState(null); // { id, message }

  const titleRef = useRef(null);
  const noticeRef = useRef(null);
  const formRef = useRef(null);
  const newTokenRef = useRef(null);
  const copyRef = useRef(null);
  const errorRef = useRef(null);
  const revokeButtons = useRef(new Map()); // token id → its Revoke button
  // A step that takes away the control holding keyboard focus (Create, Done, Cancel, Revoke) says
  // where focus goes instead, and it moves there once the step has rendered, rather than dropping
  // to the page.
  const focusNext = useRef(null);
  useEffect(() => {
    const pick = focusNext.current;
    if (!pick) return;
    focusNext.current = null;
    (pick() || titleRef.current)?.focus();
  });

  const closeForm = useCallback(() => { setFormOpen(false); setForm(NEW_FORM); setCreateError(''); }, []);

  // The latest request wins, so a slow answer cannot overwrite a newer one.
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const next = await api.apiTokens.list();
      if (seq !== loadSeq.current) return;
      setData(next);
      setLoadError('');
      // Nothing can be created while tokens are off, two-factor is required and not set up, or the
      // limit is reached, whether by this card or by a change elsewhere: a notice takes the form's
      // place, and the form goes with its contents, so whatever brings it back cannot bring back a
      // half-filled form or a stale refusal.
      const full = Number.isFinite(next.maxTokens) && (next.tokens?.length ?? 0) >= next.maxTokens;
      if (!next.enabled || next.reauth === 'totpSetup' || full) {
        if (formRef.current?.contains(document.activeElement)) focusNext.current = () => noticeRef.current;
        closeForm();
      }
    } catch (err) {
      if (seq === loadSeq.current) setLoadError(err.message);
    }
  }, [closeForm]);

  // Turning two-factor on or off in the card above changes what a new token is confirmed with.
  useEffect(() => { load(); }, [load, totpEnabled]);

  const choices = Array.isArray(data?.expiryChoices) ? data.expiryChoices : [];
  const expiry = choices.includes(form.expiry) ? form.expiry : defaultExpiry(choices);
  const reauth = data?.reauth;
  // Organize and draft find their messages through read, so either one brings read along.
  const readLocked = form.picked.organize || form.picked.draft;
  const scopes = SCOPES.map(s => s.id).filter(id => form.picked[id] || (id === 'read' && readLocked));
  const tokens = data?.tokens || [];
  const atLimit = Number.isFinite(data?.maxTokens) && tokens.length >= data.maxTokens;
  // An account that cannot sign in with a password confirms with a recent sign-in through single
  // sign-on: the Confirm button goes through the provider and back to this page.
  const oidcProviders = Array.isArray(data?.oidc?.providers) ? data.oidc.providers : [];
  // While the time the server gave has not passed: a form left open can outlive a confirmation.
  const confirmedUntil = data?.oidc?.confirmedUntil ?? null;
  const oidcUntil = confirmedUntil && new Date(confirmedUntil).getTime() > Date.now() ? confirmedUntil : null;
  const totpToo = reauth === 'oidc' && data?.oidc?.totpToo === true;
  const asksCode = reauth === 'totp' || (totpToo && !!oidcUntil);
  const confirmed = reauth === 'totp' ? form.code.length === 6
    : reauth === 'password' ? !!form.password
      : reauth === 'oidc' ? !!oidcUntil && (!totpToo || form.code.length === 6) : false;
  const canCreate = !creating && !!form.name.trim() && scopes.length > 0 && expiry !== undefined && confirmed;

  const setField = (field, value) => setForm(f => ({ ...f, [field]: value }));
  const toggleScope = (id) => setForm(f => {
    if (id === 'read' && (f.picked.organize || f.picked.draft)) return f;
    const picked = { ...f.picked, [id]: !f.picked[id] };
    if (picked.organize || picked.draft) picked.read = true;
    return { ...f, picked };
  });
  const cancelForm = () => {
    closeForm();
    focusNext.current = () => newTokenRef.current;
  };

  const createToken = async (e) => {
    e.preventDefault();
    if (!canCreate) return;
    setCreating(true);
    setCreateError('');
    const session = securitySession;
    try {
      const res = await api.apiTokens.create({
        name: form.name.trim(),
        scopes,
        expiresInDays: expiry,
        ...(asksCode ? { totpCode: form.code } : {}),
        ...(reauth === 'password' ? { password: form.password } : {}),
      });
      if (session !== securitySession) return;
      unseen = { userId, name: res.apiToken?.name ?? form.name.trim(), token: res.token };
      setSecret(unseen);
      setCopyResult(null);
      closeForm();
      // Copy is described by the panel's title and warning, so reaching it says what happened.
      focusNext.current = () => copyRef.current;
      if (res.apiToken) setData(d => d && { ...d, tokens: [res.apiToken, ...d.tokens] });
      load();
    } catch (err) {
      setCreateError(err.message);
      // A code works once, and a refused password is typed again, as when turning 2FA off.
      setForm(f => ({ ...f, code: '', password: '' }));
      const field = asksCode ? `${ids}-code` : reauth === 'password' ? `${ids}-password` : null;
      // With nothing to type again, the refusal itself takes focus: Create may be disabled by now.
      focusNext.current = () => (field ? document.getElementById(field) : errorRef.current);
      // A refusal can mean the server's answer changed: tokens turned off, or 2FA turned on.
      load();
    } finally {
      setCreating(false);
    }
  };

  const copySecret = async () => {
    const { ok } = await copyToClipboard(shown.token);
    setCopyResult(ok ? 'copied' : 'failed');
    // Both ways of copying failed: leave the token selected for the copy shortcut.
    if (!ok) selectElementText(secretRef.current);
  };
  const putSecretAway = () => {
    unseen = null;
    setSecret(null);
    setCopyResult(null);
    focusNext.current = () => newTokenRef.current || noticeRef.current;
  };

  const dropToken = (id) => {
    const at = tokens.findIndex(tok => tok.id === id);
    const near = [tokens[at + 1]?.id, tokens[at - 1]?.id];
    setData(d => d && { ...d, tokens: d.tokens.filter(tok => tok.id !== id) });
    setConfirmingId(null);
    // On to the next token's Revoke, or the one before when this was the last.
    focusNext.current = () => revokeButtons.current.get(near[0]) || revokeButtons.current.get(near[1])
      || newTokenRef.current || noticeRef.current;
  };
  const revoke = async (id) => {
    setRevokingId(id);
    setRevokeError(null);
    try {
      await api.apiTokens.revoke(id);
      dropToken(id);
    } catch (err) {
      // Already gone, say revoked in another tab: what was asked for is true already.
      if (err.status === 404) dropToken(id);
      else setRevokeError({ id, message: err.message });
    } finally {
      setRevokingId(null);
    }
  };

  const toggleServer = async () => {
    setSwitchBusy(true);
    setSwitchError('');
    try {
      await api.admin.updateSettings({ api_tokens_enabled: !data.enabled });
      await load();
    } catch (err) {
      setSwitchError(err.message);
    } finally {
      setSwitchBusy(false);
    }
  };

  const expiryText = (tok) => {
    if (tok.expired) return <span style={{ color: 'var(--red)' }}>{t('admin.apiTokens.expired')}</span>;
    return t('admin.apiTokens.expiresAt', { date: formatDay(tok.expiresAt) });
  };
  const lastUseText = (tok) => {
    if (!tok.lastUsedAt) return t('admin.apiTokens.neverUsed');
    const date = formatDateTime(tok.lastUsedAt);
    return tok.lastUsedIp
      ? t('admin.apiTokens.lastUsedFrom', { date, ip: tok.lastUsedIp })
      : t('admin.apiTokens.lastUsedAt', { date });
  };

  const createForm = (
    <form ref={formRef} onSubmit={createToken} style={{
      display: 'flex', flexDirection: 'column', gap: 14,
      marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)',
    }}>
      <div>
        <label htmlFor={`${ids}-name`} style={labelStyle}>{t('admin.apiTokens.nameLabel')}</label>
        <MaterialInput
          id={`${ids}-name`} type="text" maxLength={60} autoComplete="off" autoFocus
          value={form.name} onChange={e => setField('name', e.target.value)}
          placeholder={t('admin.apiTokens.namePh')} style={inputStyle}
        />
      </div>

      <fieldset style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
        <legend style={{ ...labelStyle, padding: 0 }}>{t('admin.apiTokens.scopesLabel')}</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SCOPES.map(({ id, label, desc }) => {
            const locked = id === 'read' && readLocked;
            return (
              <label key={id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: locked ? 'default' : 'pointer' }}>
                <MaterialInput
                  type="checkbox" value={id} checked={scopes.includes(id)} disabled={locked}
                  aria-describedby={id === 'read' ? [locked && `${ids}-read-locked`, `${ids}-read-warning`].filter(Boolean).join(' ') : undefined}
                  onChange={() => toggleScope(id)} style={{ marginTop: 2, accentColor: 'var(--accent)' }}
                />
                <span>
                  <span style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--text-primary)' }}>{t(label)}</span>
                  <span style={{ display: 'block', fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 1 }}>{t(desc)}</span>
                </span>
              </label>
            );
          })}
        </div>
        {readLocked && (
          <div id={`${ids}-read-locked`} style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 8 }}>{t('admin.apiTokens.readLocked')}</div>
        )}
        {/* Every token has Read, and with it every message in full, whatever else it is for. */}
        <div id={`${ids}-read-warning`} style={{ ...noticeBox, marginTop: 10, marginBottom: 0, lineHeight: 1.5, borderLeft: '3px solid var(--amber)' }}>
          {t('admin.apiTokens.readWarning')}
        </div>
      </fieldset>

      <div>
        <label htmlFor={`${ids}-expiry`} style={labelStyle}>{t('admin.apiTokens.expiryLabel')}</label>
        <MaterialSelect
          id={`${ids}-expiry`} value={expiry === undefined ? '' : String(expiry)}
          onChange={e => setField('expiry', Number(e.target.value))}
          style={{ padding: '7px 9px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 'var(--md-sys-typescale-body-medium-size)' }}
        >
          {choices.map(days => (
            <option key={days} value={String(days)}>{formatDays(days)}</option>
          ))}
        </MaterialSelect>
      </div>

      {asksCode && (
        <div>
          <label htmlFor={`${ids}-code`} style={labelStyle}>{t('admin.apiTokens.totpLabel')}</label>
          <MaterialInput
            id={`${ids}-code`} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            value={form.code} onChange={e => setField('code', e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={t('admin.security.totpVerifyPh')}
            style={{ ...inputStyle, letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums' }}
          />
        </div>
      )}
      {reauth === 'password' && (
        <div>
          <label htmlFor={`${ids}-password`} style={labelStyle}>{t('admin.apiTokens.passwordLabel')}</label>
          <PasswordInput
            id={`${ids}-password`} autoComplete="current-password"
            value={form.password} onChange={e => setField('password', e.target.value)}
            placeholder={t('admin.security.totpDisablePh')} style={inputStyle}
          />
        </div>
      )}
      {reauth === 'oidc' && (oidcUntil ? (
        <div style={hintStyle}>{t('admin.apiTokens.reauthOidcDone', { time: formatTime(oidcUntil) })}</div>
      ) : oidcProviders.length ? (
        <div>
          <div id={`${ids}-oidc-hint`} style={{ ...hintStyle, marginBottom: 8 }}>{t('admin.apiTokens.reauthOidcHint')}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {oidcProviders.map(p => (
              <a key={p.slug} href={`/auth/oidc/${p.slug}/start?action=reauth`} aria-describedby={`${ids}-oidc-hint`} className="md-button" data-variant="outlined">
                {t('admin.apiTokens.reauthOidcButton', { provider: p.name })}
              </a>
            ))}
          </div>
        </div>
      ) : (
        <div style={hintStyle}>{t('admin.apiTokens.reauthOidcNoProvider')}</div>
      ))}

      {createError && <div ref={errorRef} tabIndex={-1} role="alert" style={errorBox}>{createError}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <MaterialButton type="submit" disabled={!canCreate} variant="filled" style={primaryButton(!canCreate)}>
          {creating ? t('admin.apiTokens.creating') : t('admin.apiTokens.createButton')}
        </MaterialButton>
        <MaterialButton type="button" onClick={cancelForm} variant="outlined" style={secondaryButton}>{t('common.cancel')}</MaterialButton>
      </div>
    </form>
  );

  return (
    <div className="material-api-tokens" style={cardStyle}>
      <div ref={titleRef} tabIndex={-1} style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
        {t('admin.apiTokens.title')}
      </div>
      <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginBottom: 16, lineHeight: 1.5 }}>
        {t('admin.apiTokens.description')}
      </div>

      {shown && (
        <div style={{
          marginBottom: 16, padding: '14px 16px', borderRadius: 8,
          background: 'var(--md-sys-color-primary-container)', border: '1px solid var(--md-sys-color-outline-variant)',
        }}>
          <div id={`${ids}-secret-title`} style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 500, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
            {t('admin.apiTokens.createdTitle', { name: shown.name })}
          </div>
          <div id={`${ids}-secret-warning`} style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', fontWeight: 600, color: 'var(--text-primary)', margin: '4px 0 10px' }}>
            {t('admin.apiTokens.secretWarning')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code ref={secretRef} style={{
              flex: 1, minWidth: 0, display: 'block', padding: '8px 10px', borderRadius: 6,
              background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono, monospace)', fontSize: 'var(--md-sys-typescale-body-small-size)', wordBreak: 'break-all', userSelect: 'all',
            }}>
              {shown.token}
            </code>
            <MaterialButton
              type="button" ref={copyRef} onClick={copySecret} variant="outlined" style={secondaryButton}
              aria-describedby={`${ids}-secret-title ${ids}-secret-warning`}
            >
              {copyResult === 'copied' ? t('admin.apiTokens.copied') : t('common.copy')}
            </MaterialButton>
          </div>
          {copyResult === 'failed' && (
            <div role="alert" style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--red)', marginTop: 8 }}>{t('common.copyFailed')}</div>
          )}
          <MaterialButton type="button" onClick={putSecretAway} variant="filled" style={{ ...primaryButton(false), marginTop: 12 }}>
            {t('admin.apiTokens.done')}
          </MaterialButton>
        </div>
      )}

      {loadError ? (
        <div role="alert" style={{ ...errorBox, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>{t('admin.apiTokens.loadFailed', { message: loadError })}</span>
          <MaterialButton type="button" onClick={load} variant="outlined" style={secondaryButton}>{t('common.retry')}</MaterialButton>
        </div>
      ) : !data ? (
        <div style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--text-tertiary)' }}>{t('common.loading')}</div>
      ) : (
        <>
          {isAdmin && (
            <div className="material-token-policy" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
              <MaterialButton type="button" variant="switch" role="switch" aria-checked={!!data.enabled}
                aria-label={t('admin.apiTokens.serverSwitchLabel')} disabled={switchBusy} onClick={toggleServer} />
              <div>
                <div style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--text-secondary)' }}>{t('admin.apiTokens.serverSwitchLabel')}</div>
                <div style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-tertiary)', marginTop: 2 }}>{t('admin.apiTokens.serverSwitchDesc')}</div>
                {switchError && <div role="alert" style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--red)', marginTop: 4 }}>{switchError}</div>}
              </div>
            </div>
          )}

          {!data.enabled && (
            <div ref={noticeRef} tabIndex={-1} style={noticeBox}>
              {isAdmin ? t('admin.apiTokens.disabledNoticeAdmin') : t('admin.apiTokens.disabledNotice')}
            </div>
          )}

          {data.enabled && !shown && (
            atLimit ? (
              <div ref={noticeRef} tabIndex={-1} style={noticeBox}>{t('admin.apiTokens.maxReached', { max: data.maxTokens })}</div>
            ) : reauth === 'totpSetup' ? (
              // Two-factor is required and the user has no authenticator: the card above sets one up.
              <div ref={noticeRef} tabIndex={-1} style={noticeBox}>{t('admin.apiTokens.totpSetupNotice')}</div>
            ) : formOpen ? createForm : (
              <MaterialButton type="button" ref={newTokenRef} onClick={() => setFormOpen(true)} variant="filled" style={{ ...primaryButton(false), marginBottom: 16 }}>
                {t('admin.apiTokens.newToken')}
              </MaterialButton>
            )
          )}

          {tokens.length === 0 ? (
            <div style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', color: 'var(--text-tertiary)' }}>{t('admin.apiTokens.listEmpty')}</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tokens.map(tok => (
                <li key={tok.id} style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <span id={`${ids}-name-${tok.id}`} style={{ fontSize: 'var(--md-sys-typescale-body-medium-size)', fontWeight: 500, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{tok.name}</span>
                        {(tok.scopes || []).map(scope => (
                          <span key={scope} style={{
                            padding: '1px 7px', borderRadius: 10, fontSize: 'var(--md-sys-typescale-body-small-size)', fontWeight: 500,
                            background: 'var(--accent-dim)', color: 'var(--text-primary)',
                          }}>
                            {SCOPE_LABELS[scope] ? t(SCOPE_LABELS[scope]) : scope}
                          </span>
                        ))}
                      </div>
                      <div style={metaStyle}>
                        {t('admin.apiTokens.createdAt', { date: formatDay(tok.createdAt) })}
                        {' · '}
                        {expiryText(tok)}
                      </div>
                      <div style={metaStyle}>{lastUseText(tok)}</div>
                    </div>
                    {confirmingId !== tok.id && (
                      <MaterialButton
                        type="button" aria-describedby={`${ids}-name-${tok.id}`}
                        ref={el => { if (el) revokeButtons.current.set(tok.id, el); else revokeButtons.current.delete(tok.id); }}
                        onClick={() => { setConfirmingId(tok.id); setRevokeError(null); }}
                        style={{ ...smallButton(false), background: 'var(--md-sys-color-error-container)', border: '1px solid var(--md-sys-color-outline-variant)', color: 'var(--red)' }}
                      >
                        {t('admin.apiTokens.revokeButton')}
                      </MaterialButton>
                    )}
                  </div>
                  {confirmingId === tok.id && (
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      <span id={`${ids}-ask-${tok.id}`} style={{ flex: '1 1 200px', fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--text-secondary)' }}>{t('admin.apiTokens.revokeAsk')}</span>
                      <MaterialButton
                        type="button" disabled={revokingId === tok.id} onClick={() => revoke(tok.id)}
                        aria-describedby={`${ids}-ask-${tok.id}`}
                        style={{ ...smallButton(revokingId === tok.id), border: 'none', background: 'var(--red)', color: 'white' }}
                      >
                        {revokingId === tok.id ? t('admin.apiTokens.revoking') : t('admin.apiTokens.revokeYes')}
                      </MaterialButton>
                      {/* Focus starts on Cancel, the safe answer, and the question is read with it. */}
                      <MaterialButton
                        type="button" autoFocus disabled={revokingId === tok.id} aria-describedby={`${ids}-ask-${tok.id}`}
                        onClick={() => { setConfirmingId(null); focusNext.current = () => revokeButtons.current.get(tok.id); }}
                        style={{ ...smallButton(revokingId === tok.id), background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                      >
                        {t('common.cancel')}
                      </MaterialButton>
                    </div>
                  )}
                  {revokeError?.id === tok.id && (
                    <div role="alert" style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', color: 'var(--red)', marginTop: 8 }}>{revokeError.message}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
