import { createHmac, timingSafeEqual } from 'node:crypto';
import { UUID_RE } from '../utils/uuid.js';

// Covers the 24h Web Push delivery TTL plus delayed image loading.
const LIFETIME_MS = 48 * 60 * 60 * 1000;
function signature(value, secret) {
  return createHmac('sha256', secret).update(`mailflow:notification-avatar:v1\0${value}`).digest();
}

export function notificationAvatarUrl(subscriptionId, messageId, { secret = process.env.SESSION_SECRET, now = Date.now() } = {}) {
  if (!Number.isInteger(subscriptionId) || subscriptionId < 1 || subscriptionId > 2147483647
    || typeof messageId !== 'string' || !UUID_RE.test(messageId) || typeof secret !== 'string' || secret.length < 32) return null;
  const value = `${subscriptionId}.${messageId}.${now + LIFETIME_MS}`;
  return `/api/notification-avatar/${value}.${signature(value, secret).toString('base64url')}`;
}

export function verifyNotificationAvatarToken(token, { secret = process.env.SESSION_SECRET, now = Date.now() } = {}) {
  if (typeof token !== 'string' || token.length > 160 || typeof secret !== 'string' || secret.length < 32) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [id, messageId, expires, mac] = parts;
  if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2147483647 || !UUID_RE.test(messageId)
    || !/^\d{13}$/.test(expires) || !/^[\w-]{43}$/.test(mac)) return null;
  if (Number(expires) <= now || Number(expires) > now + LIFETIME_MS) return null;
  const received = Buffer.from(mac, 'base64url');
  const expected = signature(parts.slice(0, 3).join('.'), secret);
  if (received.toString('base64url') !== mac || received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  return { subscriptionId: Number(id), messageId };
}
