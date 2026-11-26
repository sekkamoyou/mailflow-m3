import 'express-async-errors';
import { readFileSync } from 'node:fs';
import express from 'express';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { query } from '../services/db.js';
import mailRoutes from './mail.js';

vi.mock('../services/db.js', () => ({ query: vi.fn() }));
vi.mock('../index.js', () => ({ imapManager: {} }));
vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req, res, next) => {
    const session = req.get('X-Fixture-Session');
    if (!session) return res.sendStatus(401);
    req.session = { userId: session === 'other' ? 'other' : 'owner' };
    next();
  },
}));

describe.skipIf(!process.env.MAILFLOW_TEST_DATABASE_URL)('message body translations on PostgreSQL', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const account = '22222222-2222-4222-8222-222222222222';
  const source = 'a'.repeat(64);
  const differentSource = 'b'.repeat(64);
  const path = `/api/mail/messages/${id}/translation`;
  let database, server, base;

  beforeAll(async () => {
    database = new pg.Client({ connectionString: process.env.MAILFLOW_TEST_DATABASE_URL });
    await database.connect();
    await database.query(`
      CREATE TEMP TABLE email_accounts (id UUID PRIMARY KEY, user_id TEXT NOT NULL);
      CREATE TEMP TABLE messages (id UUID PRIMARY KEY, account_id UUID NOT NULL, is_deleted BOOLEAN DEFAULT FALSE);
    `);
    const migration = readFileSync(new URL('../../migrations/0082_message_body_translations.sql', import.meta.url), 'utf8');
    await database.query(migration.replace('CREATE TABLE', 'CREATE TEMP TABLE'));
    await database.query("INSERT INTO email_accounts VALUES ($1, 'owner')", [account]);
    await database.query("INSERT INTO messages (id, account_id) VALUES ($1, $2)", [id, account]);
    query.mockImplementation((sql, values) => database.query(sql, values));
    const app = express();
    app.use(express.json());
    app.use('/api/mail', mailRoutes);
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await database?.end();
  });

  const request = (method, { session = 'browser-a', language = 'ko', hash = source, data } = {}) =>
    fetch(`${base}${path}?${new URLSearchParams({ language, source: hash })}`, {
      method,
      headers: { ...(session && { 'X-Fixture-Session': session }), 'Content-Type': 'application/json' },
      body: data && JSON.stringify(data),
    });

  it('stores segments and restores another session’s last view without replacing the result', async () => {
    expect(await (await request('GET')).json()).toEqual({ translation: null });
    const segments = ['번역 내용', '<strong>그대로 보이는 문자</strong>'];
    const saved = await request('PUT', { data: { segments } });
    expect(saved.status).toBe(200);
    expect(saved.headers.get('Cache-Control')).toBe('no-store');
    expect(await saved.json()).toEqual({ translation: { segments, translated: true } });
    const hidden = await request('PATCH', { session: 'browser-b', data: { translated: false } });
    expect(await hidden.json()).toEqual({ translation: { segments, translated: false } });
    expect(await (await request('GET', { session: 'browser-c' })).json())
      .toEqual({ translation: { segments, translated: false } });
    expect(await (await request('GET', { hash: differentSource })).json()).toEqual({ translation: null });
    expect(await (await request('GET', { language: 'en' })).json()).toEqual({ translation: null });
    expect((await request('PATCH', { hash: differentSource, data: { translated: true } })).status).toBe(404);
    const updated = await request('PUT', { session: 'browser-c', data: { segments: ['다시 번역한 내용'] } });
    expect(await updated.json()).toEqual({ translation: { segments: ['다시 번역한 내용'], translated: true } });
  });

  it('refuses anonymous or cross-account access and malformed writes', async () => {
    expect((await request('GET', { session: '' })).status).toBe(401);
    expect((await request('GET', { session: 'other' })).status).toBe(404);
    expect((await request('PUT', { session: 'other', data: { segments: ['다른 계정'] } })).status).toBe(404);
    expect((await request('PATCH', { session: 'other', data: { translated: false } })).status).toBe(404);
    expect((await request('GET', { hash: 'not-a-hash' })).status).toBe(400);
    expect((await request('PUT', { data: { segments: ['https://example.invalid'] } })).status).toBe(400);
    expect((await request('PUT', { data: { segments: ['bad\0text'] } })).status).toBe(400);
    expect((await request('PATCH', { data: { translated: 'false' } })).status).toBe(400);
  });

  it('drops cached translations when the mail row is deleted', async () => {
    await request('PUT', { data: { segments: ['임시 저장'] } });
    await database.query('DELETE FROM messages WHERE id = $1', [id]);
    expect((await request('GET')).status).toBe(404);
    expect((await database.query('SELECT * FROM message_body_translations')).rows).toEqual([]);
  });
});
