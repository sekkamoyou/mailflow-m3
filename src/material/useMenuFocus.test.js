import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useMenuFocus } from './useMenuFocus.js';

const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
const doc = dom.window.document;
Object.assign(globalThis, { window: dom.window, document: doc, IS_REACT_ACT_ENVIRONMENT: true });
let root;
afterEach(async () => { if (root) await React.act(async () => root.unmount()); root = null; });

function Menu({ onClose }) {
  const ref = useRef(null);
  useMenuFocus(ref, onClose);
  return React.createElement('div', { ref, role: 'menu' },
    ...['Archive', 'Disabled', 'Delete', 'Reply'].map((label, i) => React.createElement('button', {
      key: label, role: 'menuitem', tabIndex: -1, disabled: i === 1, id: label,
    }, label)));
}
function Harness() {
  const [open, setOpen] = useState(false);
  return React.createElement(React.Fragment, null,
    React.createElement('button', { id: 'opener', onClick: () => setOpen(true) }, 'Menu'),
    open && React.createElement(Menu, { onClose: () => setOpen(false) }),
    React.createElement('button', { id: 'next' }, 'Next'));
}
async function mount() {
  await React.act(async () => { root = createRoot(doc.getElementById('root')); root.render(React.createElement(Harness)); });
  doc.getElementById('opener').focus();
  await React.act(async () => doc.getElementById('opener').click());
}
async function key(key) {
  await React.act(async () => doc.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
}
test('menu skips disabled items, wraps, supports Home/End/typeahead and Escape', async () => {
  await mount();
  assert.equal(doc.activeElement.id, 'Archive');
  await key('ArrowDown'); assert.equal(doc.activeElement.id, 'Delete');
  await key('End'); assert.equal(doc.activeElement.id, 'Reply');
  await key('ArrowDown'); assert.equal(doc.activeElement.id, 'Archive');
  await key('ArrowUp'); assert.equal(doc.activeElement.id, 'Reply');
  await key('Home'); assert.equal(doc.activeElement.id, 'Archive');
  await key('r'); assert.equal(doc.activeElement.id, 'Reply');
  await key('Escape'); assert.ok(!doc.querySelector('[role=menu]'));
  assert.equal(doc.activeElement.id, 'opener');
});
test('closing by outside focus does not steal the newly chosen focus', async () => {
  await mount();
  await React.act(async () => {
    doc.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    doc.getElementById('next').focus();
  });
  assert.equal(doc.activeElement.id, 'next');
  assert.ok(!doc.querySelector('[role=menu]'));
});
