import { describe, it, expect } from 'vitest';
import { notificationAvatarUrl, verifyNotificationAvatarToken } from './notificationAvatar.js';

const MID = '11111111-1111-4111-8111-111111111111';
const options = { secret: 's'.repeat(32), now: 1800000000000 };
const token = url => url.split('/').at(-1);

describe('notification image capabilities', () => {
  it('binds the device subscription and message without exposing an email or login cookie', () => {
    const url = notificationAvatarUrl(7, MID, options);
    expect(verifyNotificationAvatarToken(token(url), options)).toEqual({ subscriptionId: 7, messageId: MID });
    expect(url).not.toContain('@');
    expect(notificationAvatarUrl(8, MID, options)).not.toBe(url);
  });
  it('rejects tampering, a different signing key and malformed tokens', () => {
    const value = token(notificationAvatarUrl(7, MID, options));
    for (const bad of [value.replace(/^7/, '8'), value.replace(MID, MID.replace(/^1/, '2')), value + 'x', '', '...']) {
      expect(verifyNotificationAvatarToken(bad, options)).toBeNull();
    }
    expect(verifyNotificationAvatarToken(value, { ...options, secret: 't'.repeat(32) })).toBeNull();
  });
  it('expires after the push delivery window and fails closed without a signing key', () => {
    const value = token(notificationAvatarUrl(7, MID, options));
    expect(verifyNotificationAvatarToken(value, { ...options, now: options.now + 48 * 3600000 })).toBeNull();
    expect(verifyNotificationAvatarToken(value, { ...options, secret: '' })).toBeNull();
    for (const id of [0, -1, 2147483648, '7']) expect(notificationAvatarUrl(id, MID, options)).toBeNull();
    expect(notificationAvatarUrl(7, 'bad', options)).toBeNull();
    expect(notificationAvatarUrl(7, MID, { ...options, secret: '' })).toBeNull();
  });
});
