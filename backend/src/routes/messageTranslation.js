import { Router } from 'express';
import { query } from '../services/db.js';
import { findOwnedMessage } from '../services/ownership.js';
import { isUuid } from '../utils/uuid.js';

const router = Router({ mergeParams: true });
const LANGUAGE = /^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/i;
const HASH = /^[a-f0-9]{64}$/;
const validSegments = segments => Array.isArray(segments) && segments.length > 0
  && segments.every(text => typeof text === 'string' && text.trim() && text.isWellFormed()
    && !text.includes('\0') && !/[\r\n]|https?:\/\//i.test(text));

router.use(async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const { id } = req.params;
  const { language, source } = req.query;
  if (!isUuid(id) || typeof language !== 'string' || !LANGUAGE.test(language) ||
      typeof source !== 'string' || !HASH.test(source)) {
    return res.status(400).json({ error: 'Invalid translation key' });
  }
  const message = await findOwnedMessage(req.session.userId, id, { columns: 'm.id', live: true });
  if (!message) return res.status(404).json({ error: 'Message not found' });
  res.locals.translationKey = [id, language.toLowerCase(), source];
  next();
});

router.get('/', async (_req, res) => {
  const { rows } = await query(
    'SELECT segments, translated FROM message_body_translations WHERE message_id = $1 AND language = $2 AND source_hash = $3',
    res.locals.translationKey
  );
  res.json({ translation: rows[0] ?? null });
});

router.put('/', async (req, res) => {
  const { segments } = req.body || {};
  if (!validSegments(segments)) return res.status(400).json({ error: 'Invalid translation segments' });
  const { rows } = await query(
    `INSERT INTO message_body_translations (message_id, language, source_hash, segments)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (message_id, language, source_hash)
     DO UPDATE SET segments = EXCLUDED.segments, translated = TRUE
     RETURNING segments, translated`,
    [...res.locals.translationKey, JSON.stringify(segments)]
  );
  res.json({ translation: rows[0] });
});

router.patch('/', async (req, res) => {
  const { translated } = req.body || {};
  if (typeof translated !== 'boolean') return res.status(400).json({ error: 'Invalid translation view' });
  const { rows } = await query(
    `UPDATE message_body_translations SET translated = $4
     WHERE message_id = $1 AND language = $2 AND source_hash = $3
     RETURNING segments, translated`,
    [...res.locals.translationKey, translated]
  );
  if (!rows.length) return res.status(404).json({ error: 'Translation not found' });
  res.json({ translation: rows[0] });
});

export default router;
