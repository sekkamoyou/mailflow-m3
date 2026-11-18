import { useEffect, useRef, useState } from 'react';
import { useConversationScroll } from '../hooks/useConversationScroll.js';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/index.js';
import { bodyCache } from '../utils/bodyCache.js';
import { api } from '../utils/api.js';
import { fetchMessageBodyWithRetry } from '../utils/messageBody.js';
import { prefetchSwipeConversation } from '../utils/swipeConversation.js';
import { normalizeConversation, initialExpandedMessageIds, shouldUseConversationPane, conversationMembershipKey, newestConversationMessage } from '../utils/conversation.js';
import { inAccount } from '../utils/threadActions.js';
import { showDark } from '../utils/darkScheme.js';
import MessageSenderCard from './MessageSenderCard.jsx';
import MessageBodyCard, { MessageTextBody } from './MessageBodyCard.jsx';
import MessageBodyView from './MessageBodyView.jsx';
import ConversationMessageCard from './ConversationMessageCard.jsx';
import AttachmentStrip from './AttachmentStrip.jsx';
import { rowOwnMessage } from '../utils/composeFromMessage.js';
import { RemoteImagesNotice, UnsubscribeNotice } from './MessageActions.jsx';

// The same display components, without opening/reading the neighbor or running its actions.
export default function SwipeMessagePreview({ row: listedRow }) {
  const row = rowOwnMessage(listedRow);
  const { t } = useTranslation();
  const mode = useStore(s => s.conversationMode);
  const searchQuery = useStore(s => s.searchQuery);
  const folder = useStore(s => s.selectedFolder);
  const selectedAccountId = useStore(s => s.selectedAccountId);
  const theme = useStore(s => s.theme);
  const darkEmailBodies = useStore(s => s.darkEmailBodies);
  const userId = useStore(s => s.user?.id);
  const conversation = shouldUseConversationPane({ mode, searchQuery, message: row });
  const [body, setBody] = useState(() => bodyCache.get(row.id));
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState(null);
  const [darkResult, setDarkResult] = useState(null);
  const iframeRef = useRef(null);
  const stackRef = useRef(null);
  const emailScaleRef = useRef(1);
  useEffect(() => {
    let cancelled = false;
    const load = conversation
      ? prefetchSwipeConversation(row.thread_id, folder, !selectedAccountId).promise.then(data => {
        if (!cancelled) setMessages(normalizeConversation(data.messages || []));
      })
      : (bodyCache.has(row.id) ? Promise.resolve(bodyCache.get(row.id)) : fetchMessageBodyWithRetry(row.id, {
        load: id => api.getMessageBody(id), isCancelled: () => cancelled,
      })).then(data => {
        if (cancelled) return;
        bodyCache.set(row.id, data);
        setBody(data);
      });
    load.catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [row.id, row.thread_id, conversation, folder, selectedAccountId, userId]);
  const focusedId = messages ? newestConversationMessage(inAccount(messages, selectedAccountId ? row.account_id : null))?.id ?? row.id : row.id;
  useConversationScroll(stackRef, focusedId, conversationMembershipKey(messages || []));
  const bodyDark = showDark({ body, themeKey: theme, setting: darkEmailBodies });
  const shownDark = bodyDark && !(darkResult?.requested && darkResult.outcome === 'light');
  const expanded = messages && initialExpandedMessageIds(inAccount(messages, selectedAccountId ? row.account_id : null));
  return <div ref={stackRef} inert="" className="material-message-scroll" style={{ position: 'relative', height: '100%', padding: conversation ? 12 : 0, overflowY: 'auto', overflowX: 'hidden', pointerEvents: 'none', background: 'var(--bg-primary)' }}>
    {conversation ? <>
      {messages?.map(message => <ConversationMessageCard key={message.id} message={message}
        expanded={expanded.has(message.id) || message.id === focusedId} selected={message.id === focusedId} preview />)}
    </> : <>
      <div className="material-reader-content" style={{ padding: '12px 0 0' }}>
        <MessageSenderCard message={row} body={body} isMobile />
        {body?.attachments?.length > 0 && <div style={{ marginBottom: 20 }}><AttachmentStrip messageId={row.id} attachments={body.attachments} /></div>}
      </div>
      <div className="material-message-body" style={{ paddingBottom: 16 }}>
      {row.list_unsubscribe && !row.unsubscribed_at && <UnsubscribeNotice />}
      {body?.hasBlockedRemoteImages && <RemoteImagesNotice fromEmail={row.from_email} />}
      {body?.html && <MessageBodyCard isMobile shownDark={shownDark} surface={darkResult?.surface}>
        <MessageBodyView body={body} messageId={row.id} iframeRef={iframeRef} emailScaleRef={emailScaleRef} dark={bodyDark} onDarkResult={setDarkResult} />
      </MessageBodyCard>}
      {!body?.html && body?.text && <MessageTextBody text={body.text} isMobile dark={bodyDark} />}
      </div>
    </>}
    {error && <div style={{ padding: 16, color: 'var(--red)' }}>{error}</div>}
    {!error && (conversation ? !messages : !body) && <div role="status" style={{ padding: 16, color: 'var(--text-secondary)' }}>{t('common.loading')}</div>}
  </div>;
}
