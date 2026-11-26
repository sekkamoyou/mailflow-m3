import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MaterialButton, MaterialIcon } from '../material/controls.jsx';
import { useStore } from '../store/index.js';
import { prepareBodyTranslation, translateBodySegments } from '../utils/bodyTranslation.js';
import { aiRuns } from '../utils/aiRunRegistry.js';
import { api } from '../utils/api.js';
import { htmlLang } from '../utils/browserLanguage.js';

const MAX_ENTRIES = 50;
const MAX_CHARS = 40 * 1024 * 1024;
const sizeOf = entry => entry.source.length + entry.text.length;
const pendingWrites = new Map();

function rememberTranslation(userId, scope, entry) {
  useStore.setState(state => {
    if (state.user?.id !== userId || (!entry && !state.bodyTranslations.has(scope))) return state;
    const bodyTranslations = new Map(state.bodyTranslations);
    bodyTranslations.delete(scope);
    if (entry) bodyTranslations.set(scope, entry);
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
  const [lookup, setLookup] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const format = body?.html ? 'html' : 'text';
  const source = body?.[format];
  const hasBody = Boolean(active && userId != null && messageId && source);
  const canTranslate = Boolean(aiStatus?.enabled && aiStatus?.features?.summarize);
  const current = hasBody && saved?.source === source ? saved : null;
  const remote = hasBody && lookup?.scope === scope && lookup.source === source ? lookup : null;
  const operation = hasBody && view?.scope === scope && view.source === source ? view : null;
  const busy = Boolean(operation?.loading || operation?.saving);

  useEffect(() => () => request.current?.abort(), [scope, active, canTranslate, source]);

  useEffect(() => {
    if (!hasBody) return;
    let cancelled = false;
    const load = async () => {
      setLookup({ scope, source });
      try {
        const prepared = prepareBodyTranslation({ [format]: source });
        if (!prepared.segments.length) {
          if (!cancelled) setLookup({ scope, source, empty: true });
          return;
        }
        const fingerprint = await prepared.fingerprint();
        await pendingWrites.get(scope)?.catch(() => {});
        if (cancelled || useStore.getState().user?.id !== userId) return;
        const { translation } = await api.bodyTranslations.get(messageId, language, fingerprint);
        if (cancelled) return;
        rememberTranslation(userId, scope, translation ? {
          source, text: prepared.render(translation.segments), translated: translation.translated,
        } : null);
        setLookup({ scope, source, fingerprint, prepared });
      } catch {
        if (!cancelled) setLookup({ scope, source, error: true });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [hasBody, scope, source, format, messageId, language, userId, loadAttempt]);

  const save = async change => {
    if (!remote?.prepared || pendingWrites.has(scope) || useStore.getState().user?.id !== userId) return;
    setView({ scope, source, saving: true });
    const args = [messageId, language, remote.fingerprint];
    const write = change.segments
      ? api.bodyTranslations.save(...args, change.segments)
      : api.bodyTranslations.setView(...args, change.translated);
    pendingWrites.set(scope, write);
    try {
      const { translation } = await write;
      rememberTranslation(userId, scope, {
        source, text: remote.prepared.render(translation.segments), translated: translation.translated,
      });
      setView(state => state?.scope === scope && state.source === source ? null : state);
    } catch {
      setView(state => state?.scope === scope && state.source === source
        ? { scope, source, retry: change } : state);
    } finally {
      pendingWrites.delete(scope);
    }
  };

  const generate = async () => {
    if (!canTranslate || !remote?.prepared || pendingWrites.has(scope) ||
        (request.current && !request.current.signal.aborted)) return;
    const key = `body-translation-${instance}-${++sequence.current}`;
    const controller = aiRuns.start(messageId, key, new AbortController());
    request.current = controller;
    setView({ scope, source, loading: true });
    try {
      const target = new Intl.DisplayNames(['en'], { type: 'language' }).of(language);
      const segments = await translateBodySegments(remote.prepared.segments, target, messages =>
        api.ai.chat(messages, { purpose: 'summarize', signal: controller.signal })
      );
      if (!controller.signal.aborted) await save({ segments });
    } catch {
      if (!controller.signal.aborted) setView({ scope, source, error: true });
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (controller.signal.aborted) {
          setView(state => state?.scope === scope && state.source === source && state.loading ? null : state);
        }
      }
      aiRuns.finish(messageId, key);
    }
  };

  const displayBody = current?.translated ? { ...body, [format]: current.text } : body;
  const unavailable = aiStatus != null && !canTranslate;
  const syncError = remote?.error || operation?.retry;
  const toggleLabel = current?.translated ? 'message.showOriginalBody'
    : current ? 'message.showTranslatedBody' : 'message.translateBody';
  const controls = hasBody && (canTranslate || unavailable || current || syncError) ? (
    <div className="material-body-translation-controls">
      {((canTranslate && !remote?.empty) || current) && (
        <MaterialButton variant="text" type="button"
          onClick={current ? () => save({ translated: !current.translated }) : generate}
          disabled={!remote?.prepared || busy || Boolean(operation?.retry)}>
          <MaterialIcon name={current?.translated ? 'description' : 'translate'} />
          {t(toggleLabel)}
        </MaterialButton>
      )}
      {canTranslate && current && (
        <MaterialButton variant="text" type="button" onClick={generate}
          disabled={!remote?.prepared || busy || Boolean(operation?.retry)}>
          {t('message.retranslateBody')}
        </MaterialButton>
      )}
      {unavailable && <span>{t('message.translationUnavailable')}</span>}
      <span role="status">{operation?.loading ? t('message.translatingBody') : operation?.saving ? t('common.saving') : null}</span>
      {operation?.error && <span role="alert">{t('message.translationFailed')}</span>}
      {syncError && <>
        <span role="alert">{t('message.translationSyncFailed')}</span>
        <MaterialButton variant="text" type="button"
          onClick={() => operation?.retry ? save(operation.retry) : setLoadAttempt(value => value + 1)}>
          {t('common.retry')}
        </MaterialButton>
      </>}
    </div>
  ) : null;
  return { displayBody, controls };
}
