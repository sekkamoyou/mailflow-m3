import { query } from './db.js';
import { snippetFromBody } from './messageParser.js';

// Cached membership only: never opens an IMAP connection or changes a message.
export async function messageMetadata(userId, ids) {
  if (!ids.length) return [];
  const { rows } = await query(`
    SELECT m.id, m.snippet,
           CASE WHEN COALESCE(m.snippet, '') = '' THEN LEFT(m.body_text, 4096) END AS body_text,
           CASE WHEN COALESCE(m.snippet, '') = '' THEN LEFT(m.body_html, 8192) END AS body_html,
           ARRAY(SELECT DISTINCT copy.folder FROM messages copy
             WHERE copy.account_id = m.account_id AND NOT copy.is_deleted
               AND (copy.message_id = NULLIF(m.message_id, '')
                 OR (NULLIF(m.message_id, '') IS NULL AND copy.id = m.id))
             ORDER BY copy.folder) AS folder_paths
    FROM messages m JOIN email_accounts a ON a.id = m.account_id
    WHERE a.user_id = $1 AND m.id = ANY($2::uuid[]) AND NOT m.is_deleted
  `, [userId, ids]);
  return rows.map(row => ({ id: row.id, folder_paths: row.folder_paths,
    snippet: row.snippet || snippetFromBody(row.body_text, row.body_html) || '' }));
}
