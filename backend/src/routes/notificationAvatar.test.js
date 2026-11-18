import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
vi.mock('../services/db.js', () => ({ query: vi.fn() }));
vi.mock('../services/kvStore.js', () => ({ kv: {} }));
import { createNotificationAvatarHandler } from './notificationAvatar.js';
import { notificationAvatarUrl } from '../services/notificationAvatar.js';
import { gravatarCache, gravatarCacheSet } from '../services/gravatarCache.js';

const MID = '11111111-1111-4111-8111-111111111111';
const EMAIL = 'sender@example.invalid';
let image, server, base, path, originalSecret;
const queryFn = vi.fn();
const cachedFavicon = vi.fn();
beforeAll(async () => {
  originalSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'notification-avatar-test-key-123456789';
  image = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#6750a4' } }).png().toBuffer();
  path = notificationAvatarUrl(7, MID);
  const app = express();
  app.get('/api/notification-avatar/:token', createNotificationAvatarHandler({ queryFn, cachedFavicon }));
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
  if (originalSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = originalSecret;
});
beforeEach(() => {
  gravatarCache.clear();
  queryFn.mockReset().mockResolvedValue({ rows: [{ from_email: EMAIL, preferences: {}, photo_data: null }] });
  cachedFavicon.mockReset().mockResolvedValue(null);
});
const request = () => fetch(base + path, { headers: { Cookie: 'unrelated-session=expired' } });

describe('private cached avatars for push notifications', () => {
  it('serves a normalized contact image without session authentication, scoped to the subscription owner', async () => {
    queryFn.mockResolvedValue({ rows: [{ from_email: EMAIL, photo_data: `data:image/png;base64,${image.toString('base64')}`, preferences: {} }] });
    const res = await request();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).format).toBe('png');
    expect(queryFn.mock.calls[0][1]).toEqual([7, MID]);
    expect(queryFn.mock.calls[0][0]).toContain('a.user_id = p.user_id');
    expect(queryFn.mock.calls[0][0]).toContain('user_id = p.user_id AND primary_email');
    expect(cachedFavicon).not.toHaveBeenCalled();
  });
  it('clips avatars to a circle with transparent corners and preserves the center', async () => {
    queryFn.mockResolvedValue({ rows: [{ from_email: EMAIL, photo_data: image.toString('base64'), preferences: {} }] });
    const res = await request();
    const { data, info } = await sharp(Buffer.from(await res.arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(32);
    expect(info.height).toBe(32);
    expect(info.channels).toBe(4);
    const pixel = (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
    for (const [x, y] of [[0, 0], [31, 0], [0, 31], [31, 31]]) expect(pixel(x, y)[3]).toBe(0);
    expect(pixel(16, 16)).toEqual([103, 80, 164, 255]);
    expect(pixel(16, 1)[3]).toBe(255);
  });
  it('center-crops rectangular sources to a square and caps large images without enlarging small ones', async () => {
    for (const [width, height, expected] of [[80, 40, 40], [40, 80, 40], [384, 512, 192]]) {
      const source = await sharp({ create: { width, height, channels: 3, background: '#6750a4' } }).jpeg().toBuffer();
      queryFn.mockResolvedValue({ rows: [{ from_email: EMAIL, photo_data: source.toString('base64'), preferences: {} }] });
      const res = await request();
      expect(res.status).toBe(200);
      const metadata = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
      expect(metadata.width).toBe(expected);
      expect(metadata.height).toBe(expected);
      expect(metadata.hasAlpha).toBe(true);
    }
  });
  it('rejects an invalid signature before touching the database or caches', async () => {
    const res = await fetch(base + path.replace('/7.', '/8.'));
    expect(res.status).toBe(404);
    expect(queryFn).not.toHaveBeenCalled();
    expect(cachedFavicon).not.toHaveBeenCalled();
  });
  it('revokes the image when the subscription or owned message no longer exists', async () => {
    queryFn.mockResolvedValue({ rows: [] });
    expect((await request()).status).toBe(404);
    expect(cachedFavicon).not.toHaveBeenCalled();
  });
  it('honors opt-in for cached Gravatar and prefers it over the favicon', async () => {
    const hash = createHash('sha256').update(EMAIL).digest('hex');
    gravatarCacheSet(hash, { buf: image, type: 'image/png', expires: Date.now() + 60000 });
    queryFn.mockResolvedValue({ rows: [{ from_email: EMAIL, preferences: { gravatarAvatars: true } }] });
    expect((await request()).status).toBe(200);
    expect(cachedFavicon).not.toHaveBeenCalled();
    queryFn.mockResolvedValue({ rows: [{ from_email: EMAIL, preferences: { gravatarAvatars: false, senderFavicons: false } }] });
    expect((await request()).status).toBe(404);
  });
  it('does not use expired or negative Gravatar entries and reuses cached favicons only when enabled', async () => {
    const hash = createHash('sha256').update(EMAIL).digest('hex');
    queryFn.mockResolvedValue({ rows: [{ from_email: EMAIL, preferences: { gravatarAvatars: true, senderFavicons: true } }] });
    cachedFavicon.mockResolvedValue(image);
    for (const entry of [{ buf: image, expires: Date.now() - 1 }, { miss: true, expires: Date.now() + 60000 }]) {
      gravatarCacheSet(hash, entry);
      expect((await request()).status).toBe(200);
    }
    expect(cachedFavicon).toHaveBeenCalledWith('example.invalid');
    queryFn.mockResolvedValue({ rows: [{ from_email: EMAIL, preferences: {} }] });
    cachedFavicon.mockClear();
    expect((await request()).status).toBe(404);
    expect(cachedFavicon).not.toHaveBeenCalled();
  });
  it('rejects invalid contact bytes and SVG; falls back on cache miss or dependency failure', async () => {
    for (const photo_data of [Buffer.from('bad bytes').toString('base64'), `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`]) {
      queryFn.mockResolvedValue({ rows: [{ from_email: EMAIL, photo_data, preferences: {} }] });
      expect((await request()).status).toBe(404);
    }
    queryFn.mockRejectedValue(new Error('db offline'));
    expect((await request()).status).toBe(404);
  });
});
