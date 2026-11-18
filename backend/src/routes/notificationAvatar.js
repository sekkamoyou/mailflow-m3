import { Router } from 'express';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { query } from '../services/db.js';
import { gravatarCache } from '../services/gravatarCache.js';
import { getCachedSenderFavicon, normalizeSenderDomain } from '../services/senderFavicon.js';
import { verifyNotificationAvatarToken } from '../services/notificationAvatar.js';
import { sniffImageType } from '../utils/inlineImages.js';

async function png(bytes) {
  if (!bytes?.length || bytes.length > 2 * 1024 * 1024) return null;
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(sniffImageType(bytes))) return null;
  try {
    const image = sharp(bytes, { limitInputPixels: 16_000_000 });
    const { width, height } = await image.metadata();
    const size = Math.min(192, width, height);
    const circle = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`);
    return await image.resize(size, size, { fit: 'cover' }).ensureAlpha()
      .composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();
  } catch { return null; }
}

export function createNotificationAvatarHandler({ queryFn = query, cachedFavicon = getCachedSenderFavicon } = {}) {
  return async (req, res) => {
    res.set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer',
    });
    const capability = verifyNotificationAvatarToken(req.params.token);
    if (!capability) return res.status(404).end();
    try {
      // Subscription removal revokes the URL even after browser session expiry.
      const { rows } = await queryFn(`
        SELECT m.from_email, u.preferences, c.photo_data
        FROM push_subscriptions p
        JOIN users u ON u.id = p.user_id
        JOIN email_accounts a ON a.user_id = p.user_id AND a.enabled = true
        JOIN messages m ON m.account_id = a.id AND m.id = $2 AND m.is_deleted = false
        LEFT JOIN LATERAL (
          SELECT photo_data FROM contacts
          WHERE user_id = p.user_id AND primary_email = lower(m.from_email) AND photo_data IS NOT NULL
          LIMIT 1
        ) c ON true
        WHERE p.id = $1`, [capability.subscriptionId, capability.messageId]);
      const sender = rows[0];
      if (!sender) return res.status(404).end();
      let bytes;
      if (typeof sender.photo_data === 'string' && sender.photo_data.length <= 3 * 1024 * 1024) {
        const encoded = sender.photo_data.startsWith('data:') ? sender.photo_data.split(',')[1] : sender.photo_data;
        bytes = await png(Buffer.from(encoded || '', 'base64'));
      }
      const email = (sender.from_email || '').trim().toLowerCase();
      if (!bytes && sender.preferences?.gravatarAvatars === true && email) {
        const hash = createHash('sha256').update(email).digest('hex');
        const cached = gravatarCache.get(hash);
        if (cached && cached.expires > Date.now() && !cached.miss) bytes = await png(cached.buf);
      }
      if (!bytes && sender.preferences?.senderFavicons === true) {
        const domain = normalizeSenderDomain(email.slice(email.lastIndexOf('@') + 1));
        if (domain && email.includes('@')) bytes = await png(await cachedFavicon(domain));
      }
      if (!bytes) return res.status(404).end();
      res.type('png').send(bytes);
    } catch { res.status(404).end(); }
  };
}

const router = Router();
router.get('/:token', createNotificationAvatarHandler());
export default router;
