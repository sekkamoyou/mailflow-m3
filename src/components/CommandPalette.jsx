import { MaterialInput, MaterialIcon } from '../material/controls.jsx';
import { useModalFocus } from '../material/useModalFocus.js';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/index.js';
import { useMobile } from '../hooks/useMobile.js';
import { THEMES } from '../themes.js';
import { api } from '../utils/api.js';
import { labelPickerOptions, pickerNavigationDirection, executeLabelChoice } from '../utils/labelPicker.js';

const THEME_NAMES = Object.keys(THEMES);

function buildActions({ t, openCompose, setSelectedAccount, setShowAdmin, setAdminTab, theme, setTheme, accounts }) {
  const actions = [
    {
      id: 'compose',
      label: t('commandPalette.actions.compose'),
      icon: <MaterialIcon name="edit" size={15} />,
      run: () => openCompose({}),
    },
    {
      id: 'inbox',
      label: t('commandPalette.actions.inbox'),
      icon: <MaterialIcon name="inbox" size={15} />,
      run: () => setSelectedAccount(null, 'INBOX'),
    },
    {
      id: 'settings',
      label: t('commandPalette.actions.settings'),
      icon: <MaterialIcon name="settings" size={15} />,
      run: () => { setShowAdmin(true); setAdminTab('accounts'); },
    },
    {
      id: 'themes',
      label: t('commandPalette.actions.themes'),
      icon: <MaterialIcon name="palette" size={15} />,
      run: () => { setShowAdmin(true); setAdminTab('appearance'); },
    },
  ];

  // Theme switch actions
  for (const themeKey of THEME_NAMES) {
    const label = THEMES[themeKey]?.label || themeKey;
    actions.push({
      id: `theme:${themeKey}`,
      label: t('commandPalette.actions.switchTheme', { theme: label }),
      icon: <MaterialIcon name={themeKey === 'dark' ? 'dark_mode' : themeKey === 'light' ? 'light_mode' : 'brightness_auto'} size={15} />,
      active: theme === themeKey,
      run: () => setTheme(themeKey),
    });
  }

  // Per-account inbox shortcuts
  for (const a of accounts) {
    actions.push({
      id: `account:${a.id}`,
      label: t('commandPalette.actions.accountInbox', { name: a.name }),
      icon: a.icon
        ? <span style={{ fontSize: 15, lineHeight: 1, width: 15, display: 'inline-block', textAlign: 'center', flexShrink: 0 }}>{a.icon}</span>
        : <span style={{ width: 15, height: 15, borderRadius: '50%', background: a.color || '#6366f1', display: 'inline-block', flexShrink: 0 }} />,
      run: () => setSelectedAccount(a.id, 'INBOX'),
    });
  }

  return actions;
}

export default function CommandPalette({ open, onClose, labelPickerMessage = null }) {
  const { t } = useTranslation();
  const isMobile = useMobile();
  const { openCompose, setSelectedAccount, setShowAdmin, setAdminTab, theme, setTheme,
    accounts, folders, addNotification } = useStore();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [listScrolled, setListScrolled] = useState(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const busyRef = useRef(false);
  const dialogRef = useModalFocus({ enabled: open, onEscape: onClose, initialFocusRef: inputRef });

  const pickerAccount = accounts.find(account => account.id === labelPickerMessage?.account_id);
  const actions = labelPickerMessage
    ? labelPickerOptions(folders[labelPickerMessage.account_id], pickerAccount, labelPickerMessage.folder)
      .map(choice => ({
        id: `label:${choice.path}`,
        label: t('commandPalette.labelPicker.copyTo', { folder: choice.label, defaultValue: 'Copy to {{folder}}' }),
        icon: <span style={{ width: 15, textAlign: 'center' }}>◇</span>,
        run: () => executeLabelChoice(labelPickerMessage, choice,
          { getThread: api.getThread, copyMessage: api.copyMessage }),
      }))
    : buildActions({ t, openCompose, setSelectedAccount, setShowAdmin, setAdminTab, theme, setTheme, accounts });

  const filtered = query.trim()
    ? actions.filter(a => a.label.toLowerCase().includes(query.toLowerCase()))
    : actions;

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
    }
  }, [open]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  const runAction = useCallback(async (action) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await action.run();
      onClose();
    } catch (error) {
      addNotification({ title: t('commandPalette.labelPicker.error', { defaultValue: 'Could not label message' }), body: error.message });
    } finally {
      busyRef.current = false;
    }
  }, [onClose, addNotification, t]);

  const handleKeyDown = (e) => {
    const direction = labelPickerMessage ? pickerNavigationDirection(e) :
      e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (direction > 0) {
      e.preventDefault();
      e.stopPropagation();
      setActiveIdx(i => Math.min(i + 1, Math.max(0, filtered.length - 1)));
    } else if (direction < 0) {
      e.preventDefault();
      e.stopPropagation();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (filtered[activeIdx]) runAction(filtered[activeIdx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIdx];
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (!open) return null;

  return (
    <div className="material-modal-scrim"
      style={{
        position: 'fixed', inset: 0, zIndex: 9500,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        
        animation: 'backdrop-enter var(--motion-fast) var(--ease-standard) both',
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelPickerMessage
          ? t('commandPalette.labelPicker.title', { defaultValue: 'Choose a label' })
          : t('commandPalette.title', { defaultValue: 'Command palette' })}
        tabIndex={-1}
        style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '100%', minHeight: 0, display: 'flex', flexDirection: 'column',
          boxShadow: 'var(--shadow-modal)',
          overflow: 'hidden',
          animation: 'modal-enter var(--motion-fast) var(--ease-emphasized) backwards',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <MaterialIcon name="search" size={16} />
          <MaterialInput
            ref={inputRef}
            value={query}
            role="combobox"
            aria-autocomplete="list"
            aria-controls="command-palette-options"
            aria-expanded="true"
            aria-activedescendant={filtered[activeIdx] ? `command-option-${activeIdx}` : undefined}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={labelPickerMessage ? t('commandPalette.labelPicker.placeholder', { defaultValue: 'Copy or label selected message…' }) : t('commandPalette.placeholder')}
            style={{
              flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 15,
            }}
          />
          {!isMobile && <kbd style={{
            fontSize: 11, color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px',
          }}>Esc</kbd>}
        </div>

        {/* Results */}
        <div
          ref={listRef}
          id="command-palette-options"
          role="listbox"
          aria-label={labelPickerMessage
            ? t('commandPalette.labelPicker.title', { defaultValue: 'Labels' })
            : t('commandPalette.title', { defaultValue: 'Commands' })}
          onScroll={e => setListScrolled(e.currentTarget.scrollTop > 4)}
          style={{
            maxHeight: 360, minHeight: 0, overflowY: 'auto', padding: '6px 0',
            boxShadow: listScrolled ? 'inset 0 8px 8px -8px rgba(0,0,0,0.25)' : 'none',
            transition: 'box-shadow 0.2s ease',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '20px 16px', color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center' }}>
              {t('commandPalette.noResults')}
            </div>
          ) : filtered.map((action, i) => (
            <div data-md-state=""
              key={action.id}
              id={`command-option-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              onClick={() => runAction(action)}
              onMouseEnter={() => setActiveIdx(i)}
              
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '9px 16px', cursor: 'pointer',
                background: i === activeIdx ? 'var(--bg-hover)' : 'transparent',
                transition: 'background 0.08s, transform 0.08s',
              }}
            >
              <span style={{ color: action.active ? 'var(--accent)' : 'var(--text-tertiary)', display: 'flex', flexShrink: 0 }}>
                {action.icon}
              </span>
              <span style={{ fontSize: 13, color: action.active ? 'var(--accent)' : 'var(--text-primary)', flex: 1 }}>
                {action.label}
              </span>
              {action.active && (
                <MaterialIcon name="check" size={12} />
              )}
            </div>
          ))}
        </div>

        {!isMobile && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-tertiary)' }}>
            <span><kbd style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}>↑↓</kbd> {t('commandPalette.hint.navigate')}</span>
            <span><kbd style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}>↵</kbd> {t('commandPalette.hint.select')}</span>
            <span><kbd style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}>Esc</kbd> {t('commandPalette.hint.close')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
