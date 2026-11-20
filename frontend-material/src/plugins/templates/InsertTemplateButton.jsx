import { useModalFocus } from '../../material/useModalFocus.js';
import { MaterialButton, MaterialIcon } from '../../material/controls.jsx';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../utils/api.js';
import { fillVariables, fillSubject, findRecipientContact, needsContact, recipientAddress } from './variables.js';
import './templates.css';

const TemplateLibrary = lazy(() => import('./TemplateLibrary.jsx'));

export default function InsertTemplateButton({ context }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const button = useRef(null);
  const selection = useRef(null);
  const capturedSession = useRef(null);
  const savedContent = useRef('');
  const savedSubject = useRef('');
  const currentContext = useRef(context);
  currentContext.current = context;
  const request = useRef(0);
  const generation = request.current;
  const close = () => { request.current++; setOpen(false); };
  const dialog = useModalFocus({ enabled: open, returnFocusRef: button });
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  const show = () => {
    if (context.disabled) return;
    selection.current = context.captureSelection();
    savedContent.current = context.getContent(selection.current);
    savedSubject.current = context.getSubject?.() || '';
    capturedSession.current = context.sessionId;
    request.current++;
    setOpen(true);
  };
  const insert = async template => {
    const token = generation;
    if (!open || token !== request.current) return;
    const recipient = context.getRecipients()[0];
    const contact = needsContact(template.body + (template.subject || '')) ? await findRecipientContact(api, recipient) : null;
    const latest = currentContext.current;
    if (token !== request.current || latest.sessionId !== capturedSession.current || latest.disabled) return;
    if (recipientAddress(latest.getRecipients()[0]) !== recipientAddress(recipient)) throw new Error(t('templates.recipientChanged'));
    const variables = { contact, locale: i18n.language, now: new Date() };
    latest.insertContent(fillVariables(template.body, variables), selection.current, { subject: fillSubject(template.subject || '', variables) });
    close();
  };
  return <>
    <MaterialButton ref={button} type="button" variant="icon" data-compose-native-action className="insert-template-button" title={t('templates.title')}
      aria-label={t('templates.title')} aria-expanded={open} aria-haspopup="dialog" disabled={context.disabled}
      onMouseDown={event => event.preventDefault()} onClick={show}><MaterialIcon name="description" /></MaterialButton>
    {open && createPortal(<div className="template-variable-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) close();
    }} onKeyDown={event => {
      if (event.key !== 'Tab') event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={t('templates.title')} tabIndex={-1} className="template-library-dialog">
        <Suspense fallback={<p role="status">{t('common.loading')}</p>}>
          <TemplateLibrary onInsert={insert} onClose={close} captureContent={() => savedContent.current} captureSubject={() => savedSubject.current} />
        </Suspense>
      </div>
    </div>, document.body)}
  </>;
}
