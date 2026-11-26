import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildAiActionMessages } from '../aiActions.js';
import { MaterialButton, MaterialIcon } from '../material/controls.jsx';
import { useStore } from '../store/index.js';
import { aiMessageText } from '../utils/aiMessageText.js';
import { aiRuns } from '../utils/aiRunRegistry.js';
import { api } from '../utils/api.js';
import { htmlLang } from '../utils/browserLanguage.js';
import MessageBodyCard from './MessageBodyCard.jsx';

export default function MessageBodyTranslation({ enabled, messageId, body, isMobile, dark, children }) {
  const { t, i18n } = useTranslation();
  const userId = useStore(state => state.user?.id);
  const language = htmlLang(i18n.language || 'en');
  const scope = JSON.stringify([userId, messageId, language]);
  const instance = useId();
  const sequence = useRef(0);
  const request = useRef(null);
  const [view, setView] = useState(null);
  const canTranslate = enabled && messageId && (body?.text || body?.html);
  const current = canTranslate && view?.scope === scope ? view : null;

  useEffect(() => () => request.current?.abort(), [scope, enabled]);

  const toggle = async () => {
    if (current?.text) {
      setView({ ...current, translated: !current.translated });
      return;
    }
    if (request.current && !request.current.signal.aborted) return;

    const source = aiMessageText(body, { full: true });
    if (!source) {
      setView({ scope, error: true });
      return;
    }

    const key = `body-translation-${instance}-${++sequence.current}`;
    const controller = aiRuns.start(messageId, key, new AbortController());
    request.current = controller;
    setView({ scope, loading: true });
    try {
      const target = new Intl.DisplayNames(['en'], { type: 'language' }).of(language);
      const prompt = `Translate this email into ${target}. Preserve meaning and paragraph breaks. Return only the translation as plain text.`;
      const { messages, truncated } = buildAiActionMessages(prompt, source);
      const text = (await api.ai.chat(messages, { purpose: 'summarize', signal: controller.signal })).trim();
      if (!controller.signal.aborted) {
        setView(text ? { scope, text, truncated, translated: true } : { scope, error: true });
      }
    } catch {
      if (!controller.signal.aborted) setView({ scope, error: true });
    } finally {
      if (request.current === controller) request.current = null;
      aiRuns.finish(messageId, key);
    }
  };

  return <>
    {canTranslate && <div className="material-body-translation-controls">
      <MaterialButton variant="text" type="button" onClick={toggle} disabled={current?.loading}>
        <MaterialIcon name={current?.translated ? 'description' : 'translate'} />
        {t(current?.translated ? 'message.showOriginalBody' : 'message.translateBody')}
      </MaterialButton>
      <span role="status">{current?.loading && t('message.translatingBody')}</span>
      {current?.error && <span role="alert">{t('message.translationFailed')}</span>}
      {current?.translated && current.truncated && (
        <span role="status">{t('message.aiTruncated', {
          percent: Math.max(1, Math.floor((100 * current.truncated.shown) / current.truncated.total)),
        })}</span>
      )}
    </div>}
    {/* Keep the HTML frame and the original message layout mounted across the toggle. */}
    <div hidden={Boolean(current?.translated)}>{children}</div>
    {current?.translated && (
      <MessageBodyCard isMobile={isMobile} shownDark={dark}>
        <div className="material-translated-body" lang={language} dir="auto"
          style={{ color: dark ? 'var(--text-primary)' : '#1a1a1a' }}>{current.text}</div>
      </MessageBodyCard>
    )}
  </>;
}
