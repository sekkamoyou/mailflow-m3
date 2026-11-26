import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MaterialButton, MaterialIcon } from '../material/controls.jsx';
import { useStore } from '../store/index.js';
import { translateBodyText } from '../utils/bodyTranslation.js';
import { aiRuns } from '../utils/aiRunRegistry.js';
import { api } from '../utils/api.js';
import { htmlLang } from '../utils/browserLanguage.js';

const MAX_ENTRIES = 50;
const MAX_CHARS = 40 * 1024 * 1024;
const sizeOf = entry => entry.source.length + entry.text.length;

function rememberTranslation(userId, scope, entry) {
  useStore.setState(state => {
    if (state.user?.id !== userId) return state;
    const bodyTranslations = new Map(state.bodyTranslations);
    bodyTranslations.delete(scope);
    bodyTranslations.set(scope, entry);
    let chars = 0;
    for (const result of bodyTranslations.values()) chars += sizeOf(result);
    while (bodyTranslations.size > MAX_ENTRIES || (chars > MAX_CHARS && bodyTranslations.size > 1)) {
      const oldest = bodyTranslations.keys().next().value;
      chars -= sizeOf(bodyTranslations.get(oldest));
      bodyTranslations.delete(oldest);
    }
    return { bodyTranslations };
  });
}

export function useMessageBodyTranslation({ active, aiStatus, messageId, body }) {
  const { t, i18n } = useTranslation();
  const userId = useStore(state => state.user?.id);
  const language = htmlLang(i18n.language || 'en');
  const scope = JSON.stringify([userId, messageId, language, Boolean(body?.html)]);
  const saved = useStore(state => state.bodyTranslations.get(scope));
  const instance = useId();
  const sequence = useRef(0);
  const request = useRef(null);
  const [view, setView] = useState(null);
  const source = body?.html || body?.text;
  const hasBody = active && userId != null && messageId && source;
  const canTranslate = Boolean(aiStatus?.enabled && aiStatus?.features?.summarize);
  const current = hasBody && saved?.source === source ? saved : null;
  const pending = hasBody && view?.scope === scope && view.source === source ? view : null;

  useEffect(() => () => request.current?.abort(), [scope, active, canTranslate, source]);

  const toggle = async () => {
    if (current?.text) {
      rememberTranslation(userId, scope, { ...current, translated: !current.translated });
      return;
    }
    if (!canTranslate || (request.current && !request.current.signal.aborted)) return;

    const key = `body-translation-${instance}-${++sequence.current}`;
    const controller = aiRuns.start(messageId, key, new AbortController());
    request.current = controller;
    setView({ scope, source, loading: true });
    try {
      const target = new Intl.DisplayNames(['en'], { type: 'language' }).of(language);
      const text = await translateBodyText(body, target, messages =>
        api.ai.chat(messages, { purpose: 'summarize', signal: controller.signal })
      );
      if (!controller.signal.aborted) {
        rememberTranslation(userId, scope, { source, text, translated: true });
        setView(null);
      }
    } catch {
      if (!controller.signal.aborted) setView({ scope, source, error: true });
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (controller.signal.aborted) setView(null);
      }
      aiRuns.finish(messageId, key);
    }
  };

  const displayBody = current?.translated ? {
    ...body,
    [body.html ? 'html' : 'text']: current.text,
  } : body;
  const unavailable = aiStatus != null && !canTranslate;
  const controls = hasBody && (canTranslate || unavailable || current) ? (
    <div className="material-body-translation-controls">
      {(canTranslate || current) && (
        <MaterialButton variant="text" type="button" onClick={toggle} disabled={canTranslate && pending?.loading}>
          <MaterialIcon name={current?.translated ? 'description' : 'translate'} />
          {t(current?.translated ? 'message.showOriginalBody' : 'message.translateBody')}
        </MaterialButton>
      )}
      {unavailable && <span>{t('message.translationUnavailable')}</span>}
      {canTranslate && <span role="status">{pending?.loading && t('message.translatingBody')}</span>}
      {canTranslate && pending?.error && <span role="alert">{t('message.translationFailed')}</span>}
    </div>
  ) : null;
  return { displayBody, controls };
}
