import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../services/db.js', () => ({ query: vi.fn() }));
vi.mock('../middleware/auth.js', () => ({ requireAuth: (req, _res, next) => { req.session = { userId: 'owner' }; next(); } }));
vi.mock('../index.js', () => ({ imapManager: {} }));
import express from 'express';
import mailRoutes from './mail.js';
import { query } from '../services/db.js';
const ID = '11111111-1111-4111-8111-111111111111';
let server, base;
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use('/api/mail', mailRoutes);
  server = app.listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise(r => { server.closeAllConnections(); server.close(r); }));
beforeEach(() => { query.mockReset(); query.mockResolvedValue({ rows: [] }); });
const post = ids => fetch(base + '/api/mail/message-metadata', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
it.each([undefined, 'bad', ['bad'], Array(501).fill(ID)])('rejects invalid or oversized IDs without querying', async ids => {
  expect((await post(ids)).status).toBe(400); expect(query).not.toHaveBeenCalled();
});
it('accepts an empty page without querying', async () => {
  expect(await (await post([])).json()).toEqual({ messages: [] }); expect(query).not.toHaveBeenCalled();
});
it('deduplicates IDs, scopes both copies to the same owner/account and omits cached bodies from output', async () => {
  query.mockResolvedValue({ rows: [{ id: ID, folder_paths: ['INBOX', 'News/Recruit'], body_text: 'Preview from cached text', body_html: null, snippet: '' }] });
  const response = await post([ID, ID]); expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ messages: [{ id: ID, folder_paths: ['INBOX', 'News/Recruit'], snippet: 'Preview from cached text' }] });
  const [sql, params] = query.mock.calls[0]; expect(params).toEqual(['owner', [ID]]);
  expect(sql).toContain('a.user_id = $1'); expect(sql).toContain('copy.account_id = m.account_id');
  expect(sql).toContain('NOT copy.is_deleted'); expect(sql).toContain("NULLIF(m.message_id, '')");
  expect(sql).toContain('LEFT(m.body_text, 4096)'); expect(sql).toContain('LEFT(m.body_html, 8192)');
});
it('keeps an existing snippet and creates no membership for an unowned ID', async () => {
  query.mockResolvedValueOnce({ rows: [{ id: ID, folder_paths: ['INBOX'], snippet: 'Stored preview', body_text: 'Other text' }] });
  expect((await (await post([ID])).json()).messages[0].snippet).toBe('Stored preview');
  expect(await (await post([ID])).json()).toEqual({ messages: [] });
});
