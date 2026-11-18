import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('./db.js', () => ({ query: vi.fn() }));
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));
import { query } from './db.js';
import webPush from 'web-push';
import { verifyNotificationAvatarToken } from './notificationAvatar.js';
let sendPushToUser, original;
const MID = '11111111-1111-4111-8111-111111111111';
beforeAll(async () => {
  original = { VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY, SESSION_SECRET: process.env.SESSION_SECRET };
  process.env.VAPID_PUBLIC_KEY = 'test-public';process.env.VAPID_PRIVATE_KEY = 'test-private';process.env.SESSION_SECRET = 'test-push-avatar-signing-key-123456789';
  ({ sendPushToUser } = await import('./pushNotifications.js'));
});
afterAll(() => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [1, 2].map(id => ({ id, endpoint: `https://push.example.invalid/${id}`, p256dh: 'test', auth: 'test' })) });
  webPush.sendNotification.mockReset().mockResolvedValue({});
});
describe('avatar metadata in device-scoped Web Push payloads', () => {
  it('requests high urgency by default', async () => {
    await sendPushToUser('user-1', { title: 'Mail' });
    expect(webPush.sendNotification.mock.calls[0][2]).toMatchObject({ urgency: 'high', TTL: 86400 });
  });
  it.each(['very-low', 'low', 'normal', 'high'])('uses the saved newsletter urgency %s without leaking internal IDs', async urgency => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, endpoint: 'https://push.example.invalid/1', p256dh: 'test', auth: 'test', push_priorities: { newsletter: urgency } }] })
      .mockResolvedValueOnce({ rows: [{ category: 'newsletter' }] });
    await sendPushToUser('user-1', { title: 'Mail', pushMessageIds: [MID] });
    expect(query.mock.calls[1][0]).toContain('a.user_id = $2');
    expect(query.mock.calls[1][1]).toEqual([[MID], 'user-1']);
    expect(webPush.sendNotification.mock.calls[0][2].urgency).toBe(urgency);
    expect(JSON.parse(webPush.sendNotification.mock.calls[0][1])).toEqual({ title: 'Mail' });
  });
  it('keeps the high-priority mail in a mixed notification batch from being delayed', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, push_priorities: { newsletter: 'very-low', automated: 'high' } }] })
      .mockResolvedValueOnce({ rows: [{ category: 'newsletter' }, { category: 'automated' }] });
    await sendPushToUser('user-1', { pushMessageIds: [MID] });
    expect(webPush.sendNotification.mock.calls[0][2].urgency).toBe('high');
  });
  it('still sends if the category lookup fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      query.mockResolvedValueOnce({ rows: [{ id: 1 }] }).mockRejectedValueOnce(new Error('database unavailable'));
      await sendPushToUser('user-1', { pushMessageIds: [MID] });
      expect(webPush.sendNotification.mock.calls[0][2].urgency).toBe('high');
    } finally { warn.mockRestore(); }
  });
  it('does not send or look up categories without a subscription', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await sendPushToUser('user-1', { pushMessageIds: [MID] });
    expect(query).toHaveBeenCalledTimes(1);
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });
  it('signs a separate image URL for each subscription and keeps mail navigation and unread count', async () => {
    await sendPushToUser('user-1', { title: 'Mail', body: 'Subject', messageId: MID, avatarMessageId: MID, pushMessageIds: [MID], url: '/?m=' + MID, unreadCount: 3 });
    expect(query.mock.calls[0][1]).toEqual(['user-1']);
    const messages = webPush.sendNotification.mock.calls.map(([, body]) => JSON.parse(body));
    expect(messages).toHaveLength(2);
    for (const [index, message] of messages.entries()) {
      expect(verifyNotificationAvatarToken(message.avatar.split('/').at(-1))).toEqual({ subscriptionId: index + 1, messageId: MID });
      expect(message.avatarMessageId).toBeUndefined();
      expect(message.pushMessageIds).toBeUndefined();
      expect(message.messageId).toBe(MID);
      expect(message.url).toBe('/?m=' + MID);expect(message.unreadCount).toBe(3);
    }
  });
  it('leaves non-mail pushes unchanged and still removes stale subscriptions', async () => {
    webPush.sendNotification.mockRejectedValueOnce({ statusCode: 410 });
    await sendPushToUser('user-1', { title: 'Scheduled', url: '/?scheduled=one' });
    expect(JSON.parse(webPush.sendNotification.mock.calls[0][1])).toEqual({ title: 'Scheduled', url: '/?scheduled=one' });
    expect(query).toHaveBeenLastCalledWith('DELETE FROM push_subscriptions WHERE id = ANY($1)', [[1]]);
  });
});
