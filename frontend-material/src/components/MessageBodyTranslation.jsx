import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MaterialButton, MaterialIcon } from '../material/controls.jsx';
import { useStore } from '../store/index.js';
import { translateBodyText } from '../utils/bodyTranslation.js';
import { aiRuns } from '../utils/aiRunRegistry.js';
import { api } from '../utils/api.js';
import { htmlLang } from '../utils/browserLanguage.js';

export function useMessageBodyTranslation({ enabled, messageId, body }) {
  const { t, i18n } = useTranslation();
  const userId = useStore(state => state.user?.id);
  const language = htmlLang(i18n.language || 'en');
  const scope = JSON.stringify([userId, messageId, language]);
  const instance = useId();
  const sequence = useRef(0);
  const request = useRef(null);
  const [view, setView] = useState(null);
  const source = body?.html || body?.text;
  const canTranslate = enabled && messageId && source;
  const current = canTranslate && view?.scope === scope && view.source === source ? view : null;

  useEffect(() => () => request.current?.abort(), [scope, enabled, source]);

  const toggle = async () => {
    if (current?.text) {
      setView({ ...current, translated: !current.translated });
      return;
    }
    if (request.current && !request.current.signal.aborted) return;

    const key = `body-translation-${instance}-${++sequence.current}`;
    const controller = aiRuns.start(messageId, key, new AbortController());
    request.current = controller;
    setView({ scope, source, loading: true });
    try {
      const target = new Intl.DisplayNames(['en'], { type: 'language' }).of(language);
      const text = await translateBodyText(body, target, messages =>
        api.ai.chat(messages, { purpose: 'summarize', signal: controller.signal })
      );
      if (!controller.signal.aborted) setView({ scope, source, text, translated: true });
    } catch {
      if (!controller.signal.aborted) setView({ scope, source, error: true });
    } finally {
      if (request.current === controller) request.current = null;
      aiRuns.finish(messageId, key);
    }
  };

  const displayBody = current?.translated ? {
    ...body,
    [body.html ? 'html' : 'text']: current.text,
  } : body;
  const controls = canTranslate ? (
    <div className="material-body-translation-controls">
      <MaterialButton variant="text" type="button" onClick={toggle} disabled={current?.loading}>
        <MaterialIcon name={current?.translated ? 'description' : 'translate'} />
        {t(current?.translated ? 'message.showOriginalBody' : 'message.translateBody')}
      </MaterialButton>
      <span role="status">{current?.loading && t('message.translatingBody')}</span>
      {current?.error && <span role="alert">{t('message.translationFailed')}</span>}
    </div>
  ) : null;
  return { displayBody, controls };
}
