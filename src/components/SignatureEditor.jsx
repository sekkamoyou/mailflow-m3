import { MaterialIcon } from '../material/controls.jsx';
import { MaterialButton, MaterialInput, MaterialTextarea } from '../material/controls.jsx';
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/index.js';
import { pasteWithoutPageColors } from '../utils/contentEditablePaste.js';
import MaterialDialog from '../material/MaterialDialog.jsx';
import { flushSync } from 'react-dom';

const BTN = {
  background: 'none', border: 'none', borderRadius: 4,
  color: 'var(--text-secondary)', cursor: 'pointer',
  padding: '3px 7px', fontSize: 13, lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

function ToolBtn({ onClick, title, active, children }) {
  const [hov, setHov] = useState(false);
  return (
    <MaterialButton selected={active} aria-pressed={Boolean(active)} variant="text"
      title={title}
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...BTN,
        background: active || hov ? 'var(--bg-hover)' : 'none',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
      }}
    >
      {children}
    </MaterialButton>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 3px', flexShrink: 0 }} />;
}

export default function SignatureEditor({ value, onChange }) {
  const { t } = useTranslation();
  const { addNotification } = useStore();
  const editorRef = useRef(null);
  const selectionRef = useRef(null);
  const fileInputRef = useRef(null);
  const [showSource, setShowSource] = useState(false);
  const [sourceVal, setSourceVal] = useState('');
  const [prompt, setPrompt] = useState(null);
  const [url, setUrl] = useState('');

  // Seed the contenteditable on first mount only
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = value || '';
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = () => onChange(editorRef.current?.innerHTML || '');

  const editorSelection = () => {
    const range = saveSelection();
    return editorRef.current?.contains(range?.commonAncestorContainer) ? range : selectionRef.current;
  };
  // Tabbing to the toolbar must keep the same selection as pointer activation.
  const exec = (cmd, val) => {
    const range = editorSelection();
    editorRef.current?.focus();
    restoreSelection(range);
    document.execCommand(cmd, false, val ?? null);
    emit();
  };

  const insertLink = () => {
    setUrl('');
    setPrompt({ kind: 'link', selection: editorSelection() });
  };

  const insertImageFromUrl = () => {
    setUrl('');
    setPrompt({ kind: 'image', selection: editorSelection() });
  };
  const applyUrl = event => {
    event.preventDefault();
    const request = prompt;
    flushSync(() => setPrompt(null));
    restoreSelection(request.selection);
    if (url) exec(request.kind === 'link' ? 'createLink' : 'insertImage', request.kind === 'link' && !/^https?:\/\//.test(url) ? `https://${url}` : url);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 300 * 1024) {
      addNotification({ type: 'error', title: t('signatureEditor.imageTooLarge.title'), body: t('signatureEditor.imageTooLarge.body') });
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => exec('insertImage', reader.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const toggleSource = () => {
    if (!showSource) {
      // Visual → Source: capture current HTML
      const html = editorRef.current?.innerHTML || '';
      setSourceVal(html);
      setShowSource(true);
    } else {
      // Source → Visual: push raw HTML back into editor
      setShowSource(false);
      // Use a microtask so the div is back in the DOM before we write to it
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = sourceVal;
          onChange(sourceVal);
        }
      }, 0);
    }
  };

  const handleSourceChange = (e) => {
    setSourceVal(e.target.value);
    onChange(e.target.value);
  };

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 8,
      overflow: 'hidden', background: 'var(--bg-tertiary)',
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '5px 8px', borderBottom: '1px solid var(--border-subtle)',
        flexWrap: 'wrap', gap: 2,
      }}>
        <ToolBtn title={t('signatureEditor.bold')} onClick={() => exec('bold')}>
          <strong style={{ fontSize: 13 }}>B</strong>
        </ToolBtn>
        <ToolBtn title={t('signatureEditor.italic')} onClick={() => exec('italic')}>
          <em style={{ fontSize: 13 }}>I</em>
        </ToolBtn>
        <ToolBtn title={t('signatureEditor.underline')} onClick={() => exec('underline')}>
          <span style={{ textDecoration: 'underline', fontSize: 13 }}>U</span>
        </ToolBtn>
        <ToolBtn title={t('signatureEditor.strikethrough')} onClick={() => exec('strikeThrough')}>
          <span style={{ textDecoration: 'line-through', fontSize: 13 }}>S</span>
        </ToolBtn>

        <Sep />

        {/* Text color */}
        <label
          title={t('signatureEditor.textColor')}
          onMouseDown={e => e.preventDefault()}
          style={{ ...BTN, cursor: 'pointer', position: 'relative', padding: '3px 7px' }}
        >
          <MaterialIcon name="format_size" />
          <MaterialInput
            type="color"
            defaultValue="#000000"
            onChange={e => exec('foreColor', e.target.value)}
            style={{ opacity: 0, position: 'absolute', width: 0, height: 0 }}
          />
        </label>

        <Sep />

        <ToolBtn title={t('signatureEditor.link')} onClick={insertLink}>
          <MaterialIcon name="link" />
        </ToolBtn>

        <ToolBtn title={t('signatureEditor.imageUrl')} onClick={insertImageFromUrl}>
          <MaterialIcon name="image" />
        </ToolBtn>

        <ToolBtn title={t('signatureEditor.imageUpload')} onClick={() => fileInputRef.current?.click()}>
          <MaterialIcon name="upload" />
        </ToolBtn>
        <MaterialInput ref={fileInputRef} type="file" accept="image/*"
          style={{ display: 'none' }} onChange={handleFileUpload} />

        <Sep />

        <ToolBtn title={showSource ? t('signatureEditor.visualMode') : t('signatureEditor.sourceMode')} active={showSource} onClick={toggleSource}>
          <MaterialIcon name="code" />
        </ToolBtn>
      </div>

      {/* Editor area */}
      {showSource ? (
        <MaterialTextarea
          value={sourceVal}
          onChange={handleSourceChange}
          spellCheck={false}
          style={{
            display: 'block', width: '100%', minHeight: 120,
            padding: '10px 12px', background: 'transparent',
            border: 'none', outline: 'none',
            color: 'var(--text-primary)', fontFamily: 'monospace',
            fontSize: 12, lineHeight: 1.6, resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      ) : (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={() => { selectionRef.current = editorSelection(); }}
          onPaste={pasteWithoutPageColors}
          style={{
            minHeight: 100, padding: '10px 12px',
            color: 'var(--text-primary)', fontSize: 13,
            lineHeight: 1.6, outline: 'none',
          }}
        />
      )}
      {prompt && <>
        <div data-modal-scrim="" onClick={() => setPrompt(null)} style={{ position: 'fixed', inset: 0, zIndex: 9200, background: 'var(--overlay-scrim)' }} />
        <MaterialDialog aria-label={t(prompt.kind === 'link' ? 'signatureEditor.linkPrompt' : 'signatureEditor.imageUrlPrompt')}
          onClose={() => setPrompt(null)} style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 9201, width: 'calc(100vw - 48px)', maxWidth: 440, padding: 24 }}>
          <form onSubmit={applyUrl}>
            <label className="md-field-label">
              {t(prompt.kind === 'link' ? 'signatureEditor.linkPrompt' : 'signatureEditor.imageUrlPrompt')}
              <MaterialInput data-autofocus="" value={url} onChange={e => setUrl(e.target.value)} style={{ width: '100%', marginTop: 16 }} />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <MaterialButton variant="text" type="button" onClick={() => setPrompt(null)}>{t('common.cancel')}</MaterialButton>
              <MaterialButton variant="filled" type="submit" disabled={!url}>{t('compose.toolbar.apply')}</MaterialButton>
            </div>
          </form>
        </MaterialDialog>
      </>}
    </div>
  );
}

// Save/restore selection so the URL dialog doesn't lose cursor position
function saveSelection() {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;
  return sel.getRangeAt(0).cloneRange();
}

function restoreSelection(range) {
  if (!range) return;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
