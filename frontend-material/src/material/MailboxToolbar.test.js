import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { transform } from 'sucrase';
import { JSDOM } from 'jsdom';
registerHooks({ load(url, context, next) {
  if (url.endsWith('react-i18next/dist/es/index.js')) return { format: 'module', shortCircuit: true, source: 'export const useTranslation = () => ({ t: (key) => key });' };
  if (url.endsWith('.jsx')) return { format: 'module', shortCircuit: true, source: transform(readFileSync(new URL(url), 'utf8'), { transforms: ['jsx'], jsxRuntime: 'automatic' }).code };
  return next(url, context);
} });
const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { default: MailboxToolbar } = await import('./MailboxToolbar.jsx');

test('mailbox actions and hidden view settings keep their original callbacks and restore focus', async () => {
  const calls = [];
  const root = createRoot(document.getElementById('root'));
  const click = async element => React.act(async () => { element.focus(); element.click(); });
  try {
    await React.act(async () => root.render(React.createElement(MailboxToolbar, {
      label: 'Inbox', count: 17, syncLabel: 'Sync', pageSize: 50, layout: 'comfortable', unreadOnly: false,
      onSync: () => calls.push('sync'), onSelection: () => calls.push('selection'),
      onUnread: value => calls.push(value), onPageSize: value => calls.push(value), onLayout: value => calls.push(value),
    })));
    await click(document.querySelector('[title="Sync"]'));
    const selection = document.querySelector('[title="messageList.selectMessages"]');
    assert.ok(selection.textContent.includes('contextMenu.select'));
    assert.equal(selection.getAttribute('aria-pressed'), 'false');
    assert.equal(selection.querySelector('[data-icon]').getAttribute('data-icon'), 'checklist');
    await click(document.querySelector('[title="messageList.selectMessages"]'));
    const opener = document.querySelector('[title="messageList.changeLayout"]');
    await click(opener);
    assert.equal(document.querySelector('[role=dialog]').getAttribute('aria-label'), 'messageList.layout');
    await click(document.querySelector('[role=switch]'));
    for (const [select, value] of [...document.querySelectorAll('[role=dialog] select')].map((select, index) => [select, index ? 'wide' : '100'])) {
      await React.act(async () => { select.value = value; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
    }
    assert.deepEqual(calls, ['sync', 'selection', true, 100, 'wide']);
    await React.act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    assert.ok(!document.querySelector('[role=dialog]'));
    assert.ok(document.activeElement === opener);
  } finally { await React.act(async () => root.unmount()); }
});

test('active selection has a visible cancel label and exposes its toggle state', async () => {
  let cancelled = false;
  const root = createRoot(document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(MailboxToolbar, {
      label: 'Inbox', selectionMode: true, onSelection: () => { cancelled = true; },
    })));
    const selection = document.querySelector('button[aria-label="messageList.clearSelection"]');
    assert.equal(selection.getAttribute('aria-pressed'), 'true');
    assert.ok(selection.textContent.includes('common.cancel'));
    assert.equal(selection.querySelector('[data-icon]').getAttribute('data-icon'), 'close');
    await React.act(async () => selection.click());
    assert.equal(cancelled, true);
    cancelled = false;
    await React.act(async () => document.querySelector('[title="messageList.changeLayout"]').click());
    assert.equal(cancelled, true, 'view settings leave selection before opening');
    assert.ok(document.querySelector('[role=dialog]'));
  } finally { await React.act(async () => root.unmount()); }
});
