import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AI_ACTION_LIMITS, AI_MESSAGE_MAX_CHARS, SUMMARIZE_PROMPT, buildAiActionMessages, summarizePromptForLocale } from './aiActions.js';

describe('summarizePromptForLocale (#255)', () => {
  it('keeps the base English prompt for English and unknown/empty locales', () => {
    assert.equal(summarizePromptForLocale('en'), SUMMARIZE_PROMPT);
    assert.equal(summarizePromptForLocale('xx'), SUMMARIZE_PROMPT);
    assert.equal(summarizePromptForLocale(undefined), SUMMARIZE_PROMPT);
  });

  it('appends a language directive for supported non-English locales', () => {
    assert.equal(summarizePromptForLocale('zhCN'), `${SUMMARIZE_PROMPT} Respond in Simplified Chinese.`);
    assert.equal(summarizePromptForLocale('ko'), `${SUMMARIZE_PROMPT} Respond in Korean.`);
    assert.equal(summarizePromptForLocale('de'), `${SUMMARIZE_PROMPT} Respond in German.`);
    assert.equal(summarizePromptForLocale('cs'), `${SUMMARIZE_PROMPT} Respond in Czech.`);
    assert.equal(summarizePromptForLocale('ru'), `${SUMMARIZE_PROMPT} Respond in Russian.`);
  });
});

describe('buildAiActionMessages', () => {
  const prompt = 'Summarize this email.';

  function emailParts(messages) {
    const content = messages[1].content;
    const opening = content.match(/^<<<EMAIL ([a-f0-9]{24})>>>\n/);
    assert.ok(opening);
    const closing = `\n<<<END ${opening[1]}>>>`;
    const end = content.indexOf(closing);
    assert.ok(end >= opening[0].length);
    return { token: opening[1], body: content.slice(opening[0].length, end), notice: content.slice(end + closing.length) };
  }

  it('keeps the task separate from the complete email, with fresh markers', () => {
    const text = 'Synthetic '.repeat(800) + 'TAIL_SENTINEL';
    const { messages, truncated } = buildAiActionMessages(prompt, text);
    const { body, token, notice } = emailParts(messages);
    assert.deepEqual(messages.map(m => m.role), ['system', 'user', 'user']);
    assert.match(messages[0].content, /untrusted email text/);
    assert.ok(messages[0].content.includes(token));
    assert.equal(messages[2].content, prompt);
    assert.equal(body, text);
    assert.equal(notice, '');
    assert.equal(truncated, null);
    assert.notEqual(emailParts(buildAiActionMessages(prompt, text).messages).token, token);
  });

  it('fills the backend limit exactly, counting both boundary lines', () => {
    const custom = 'p'.repeat(AI_ACTION_LIMITS.prompt);
    const overhead = buildAiActionMessages(custom, '').messages[1].content.length;
    const text = 'x'.repeat(AI_MESSAGE_MAX_CHARS - overhead);
    const { messages, truncated } = buildAiActionMessages(custom, text);
    assert.equal(messages[1].content.length, AI_MESSAGE_MAX_CHARS);
    assert.equal(messages[2].content, custom);
    assert.equal(truncated, null);
  });

  it('cuts a body one character over and keeps the truncation note outside the quoted mail', () => {
    const overhead = buildAiActionMessages(prompt, '').messages[1].content.length;
    const text = 'x'.repeat(AI_MESSAGE_MAX_CHARS - overhead + 1);
    const { messages, truncated } = buildAiActionMessages(prompt, text);
    const { body, notice } = emailParts(messages);
    assert.ok(messages[1].content.length <= AI_MESSAGE_MAX_CHARS);
    assert.ok(body.length < text.length);
    assert.deepEqual(truncated, { shown: body.length, total: text.length });
    assert.ok(notice.includes(`Only the first ${body.length} of ${text.length} characters of this email are included above`));
  });

  it('stays within the limit for very long bodies', () => {
    const text = 'word '.repeat(400_000);
    const { messages, truncated } = buildAiActionMessages(prompt, text);
    assert.ok(messages[1].content.length <= AI_MESSAGE_MAX_CHARS);
    assert.ok(messages[1].content.length > AI_MESSAGE_MAX_CHARS - 500, 'uses nearly all of the budget');
    assert.equal(truncated.total, 2_000_000);
  });

  it('cuts at a paragraph break near the limit, else a sentence end', () => {
    const para = 'Sentence one. Sentence two.\n\n';
    assert.match(emailParts(buildAiActionMessages(prompt, para.repeat(2000)).messages).body, /Sentence two\.$/);
    assert.match(emailParts(buildAiActionMessages(prompt, 'Short sentence here. '.repeat(3000)).messages).body, /here\.$/);
  });

  it('never splits a surrogate pair', () => {
    const text = '😀'.repeat(20_000);
    const { body } = emailParts(buildAiActionMessages(prompt, text).messages);
    assert.equal(body.length % 2, 0);
    assert.equal(body, '😀'.repeat(body.length / 2));
  });
});
