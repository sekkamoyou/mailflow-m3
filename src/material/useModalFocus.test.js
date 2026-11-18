import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useModalFocus } from './useModalFocus.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true, url: 'https://mail.example.invalid' });
const doc = dom.window.document;
globalThis.window = dom.window;
globalThis.document = doc;
globalThis.HTMLElement = dom.window.HTMLElement;

afterEach(async () => {
  if (root) await React.act(async () => root.unmount());
  root = null;
  doc.body.innerHTML = '<div id="root"></div>';
});
let root;

function Harness() {
  const [open, setOpen] = useState(false);
  const panelRef = useModalFocus({ enabled: open, onEscape: () => setOpen(false) });
  return React.createElement(React.Fragment, null,
    React.createElement('button', { id: 'opener', onClick: () => setOpen(true) }, 'Open'),
    open && React.createElement('section', { ref: panelRef, role: 'dialog', 'aria-modal': 'true' },
      React.createElement('button', { id: 'first' }, 'First'),
      React.createElement('button', { id: 'last' }, 'Last')));
}

async function mount(Component = Harness) {
  await React.act(async () => {
    root = createRoot(doc.getElementById('root'));
    root.render(React.createElement(Component));
  });
}
async function key(target, key, shiftKey = false) {
  target.focus();
  await React.act(async () => target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })));
}

test('focus enters the panel, Tab wraps, Escape restores the opener', async () => {
  await mount();
  const opener = doc.getElementById('opener');
  opener.focus();
  await React.act(async () => opener.click());
  const first = doc.getElementById('first');
  const last = doc.getElementById('last');
  assert.ok((doc.activeElement) === (first), "DOM identity: doc.activeElement === first");
  await key(last, 'Tab');
  assert.ok((doc.activeElement) === (first), "DOM identity: doc.activeElement === first");
  await key(first, 'Tab', true);
  assert.ok((doc.activeElement) === (last), "DOM identity: doc.activeElement === last");
  await key(first, 'Escape');
  assert.ok((doc.querySelector('[role="dialog"]')) === (null), "DOM identity: doc.querySelector('[role=\"dialog\"]') === null");
  assert.ok((doc.activeElement) === (opener), "DOM identity: doc.activeElement === opener");
});

test('nested panels trap only the top panel and restore focus into its parent', async () => {
  function Nested() {
    const [outer, setOuter] = useState(false);
    const [inner, setInner] = useState(false);
    const outerRef = useModalFocus({ enabled: outer, onEscape: () => setOuter(false) });
    const innerRef = useModalFocus({ enabled: inner, onEscape: () => setInner(false) });
    return React.createElement(React.Fragment, null,
      React.createElement('button', { id: 'outer-open', onClick: () => setOuter(true) }, 'Open outer'),
      outer && React.createElement('section', { ref: outerRef, role: 'dialog', id: 'outer' },
        React.createElement('button', { id: 'inner-open', onClick: () => setInner(true) }, 'Open inner'),
        React.createElement('button', { id: 'outer-last' }, 'Outer last'),
        inner && React.createElement('section', { ref: innerRef, role: 'dialog', id: 'inner' },
          React.createElement('button', { id: 'inner-action' }, 'Inner action'))));
  }
  await mount(Nested);
  doc.getElementById('outer-open').focus();
  await React.act(async () => doc.getElementById('outer-open').click());
  const innerOpen = doc.getElementById('inner-open');
  innerOpen.focus();
  await React.act(async () => innerOpen.click());
  const innerAction = doc.getElementById('inner-action');
  assert.ok((doc.activeElement) === (innerAction), "DOM identity: doc.activeElement === innerAction");
  await key(innerAction, 'Escape');
  assert.ok((doc.activeElement) === (innerOpen), "DOM identity: doc.activeElement === innerOpen");
  await key(innerOpen, 'Escape');
  assert.ok((doc.querySelector('[role="dialog"]')) === (null), "DOM identity: doc.querySelector('[role=\"dialog\"]') === null");
  assert.ok((doc.activeElement) === (doc.getElementById('outer-open')), "DOM identity: doc.activeElement === doc.getElementById('outer-open')");
});

test('Escape leaves a modal open when no callback is supplied', async () => {
  function NoEscape() {
    const [open, setOpen] = useState(false);
    const panelRef = useModalFocus({ enabled: open });
    return React.createElement(React.Fragment, null,
      React.createElement('button', { id: 'no-escape-open', onClick: () => setOpen(true) }, 'Open'),
      open && React.createElement('section', { ref: panelRef, role: 'dialog' },
        React.createElement('button', { id: 'no-escape-action' }, 'Action')));
  }
  await mount(NoEscape);
  const opener = doc.getElementById('no-escape-open');
  opener.focus();
  await React.act(async () => opener.click());
  await key(doc.getElementById('no-escape-action'), 'Escape');
  assert.ok(doc.querySelector('[role="dialog"]'));
});

test('background and newly added portals are inert, with prior inert state preserved', async () => {
  const existing = doc.createElement('aside');
  existing.setAttribute('inert', '');
  doc.body.append(existing);
  await mount();
  const opener = doc.getElementById('opener');
  opener.focus();
  await React.act(async () => opener.click());
  assert.ok(opener.hasAttribute('inert'));
  assert.ok(!doc.querySelector('[role=dialog]').closest('[inert]'));
  const portal = doc.createElement('button');
  await React.act(async () => doc.body.append(portal));
  assert.ok(portal.hasAttribute('inert'));
  portal.focus();
  assert.ok(doc.activeElement === doc.getElementById('first'));
  await key(doc.activeElement, 'Escape');
  assert.ok(!opener.hasAttribute('inert'));
  assert.ok(!portal.hasAttribute('inert'));
  assert.ok(existing.hasAttribute('inert'));
});

test('a view that sets its own inert attribute while a modal is open stays inert afterward', async () => {
  await mount();
  await React.act(async () => doc.getElementById('opener').click());
  const view = doc.createElement('section');
  await React.act(async () => doc.body.append(view));
  assert.ok(view.hasAttribute('inert'));
  // Setting the same value still represents a declarative update from the view.
  await React.act(async () => view.setAttribute('inert', ''));
  await key(doc.activeElement, 'Escape');
  assert.ok(view.hasAttribute('inert'));
});

test('nested modal makes parent controls inert and restores them on close', async () => {
  function Nested() {
    const [inner, setInner] = useState(false);
    const outerRef = useModalFocus();
    const innerRef = useModalFocus({ enabled: inner, onEscape: () => setInner(false) });
    return React.createElement('section', { ref: outerRef, role: 'dialog' },
      React.createElement('button', { id: 'nested-opener', onClick: () => setInner(true) }, 'Open'),
      inner && React.createElement('section', { ref: innerRef, role: 'alertdialog' },
        React.createElement('button', { id: 'nested-action' }, 'Cancel')));
  }
  await mount(Nested);
  const opener = doc.getElementById('nested-opener');
  await React.act(async () => opener.click());
  assert.ok(opener.hasAttribute('inert'));
  assert.ok(!doc.getElementById('nested-action').closest('[inert]'));
  await key(doc.activeElement, 'Escape');
  assert.ok(!opener.hasAttribute('inert'));
  assert.ok(doc.activeElement === opener);
});

test('replacing a responsive panel keeps isolation and the original return target', async () => {
  function Responsive() {
    const [open, setOpen] = useState(false);
    const [compact, setCompact] = useState(false);
    const panelRef = useModalFocus({ enabled: open, onEscape: () => setOpen(false) });
    const children = React.createElement('button', { id: 'resize', onClick: () => setCompact(v => !v) }, 'Resize');
    return React.createElement(React.Fragment, null,
      React.createElement('button', { id: 'responsive-open', onClick: () => setOpen(true) }, 'Open'),
      open && React.createElement(compact ? 'section' : 'article', { ref: panelRef, role: 'dialog' }, children));
  }
  await mount(Responsive);
  const opener = doc.getElementById('responsive-open');
  opener.focus();
  await React.act(async () => opener.click());
  await React.act(async () => doc.getElementById('resize').click());
  assert.equal(doc.querySelector('[role=dialog]').tagName, 'SECTION');
  assert.ok(opener.hasAttribute('inert'));
  assert.equal(doc.activeElement.id, 'resize');
  await key(doc.activeElement, 'Escape');
  assert.ok(doc.activeElement === opener);
});

test('focus order uses the checked radio and skips hidden controls', async () => {
  function RadioPanel() {
    const [open, setOpen] = useState(false);
    const panelRef = useModalFocus({ enabled: open });
    return React.createElement(React.Fragment, null,
      React.createElement('button', { id: 'radio-open', onClick: () => setOpen(true) }, 'Open'),
      open && React.createElement('section', { ref: panelRef, role: 'dialog' },
        React.createElement('div', { style: { display: 'none' } },
          React.createElement('button', { id: 'hidden-action' }, 'Hidden')),
        React.createElement('input', { type: 'radio', name: 'group', id: 'radio-one' }),
        React.createElement('input', { type: 'radio', name: 'group', id: 'radio-two', defaultChecked: true }),
        React.createElement('button', { id: 'radio-last' }, 'Last'),
        React.createElement('button', { id: 'not-a-tab-stop', tabIndex: -1 }, 'Programmatic only')));
  }
  await mount(RadioPanel);
  const opener = doc.getElementById('radio-open');
  opener.focus();
  await React.act(async () => opener.click());
  assert.ok((doc.activeElement) === (doc.getElementById('radio-two')), "DOM identity: doc.activeElement === doc.getElementById('radio-two')");
  await key(doc.getElementById('radio-last'), 'Tab');
  assert.ok((doc.activeElement) === (doc.getElementById('radio-two')), "DOM identity: doc.activeElement === doc.getElementById('radio-two')");
  assert.ok(!doc.getElementById('hidden-action').closest('[hidden]'));
  assert.notEqual(doc.activeElement, doc.getElementById('hidden-action'));
});

test('a sibling confirmation stays above a parent registered after it', async () => {
  function Confirmation({ close }) {
    const ref = useModalFocus({ onEscape: close });
    return React.createElement('section', { ref, role: 'alertdialog', style: { position: 'fixed', zIndex: 2101 } },
      React.createElement('button', { id: 'sibling-cancel', onClick: close }, 'Cancel'));
  }
  function Siblings() {
    const [open, setOpen] = useState(true);
    const [compact, setCompact] = useState(false);
    const ref = useModalFocus({ enabled: compact });
    return React.createElement(React.Fragment, null,
      React.createElement('section', { ref, role: 'dialog', style: { position: 'fixed', zIndex: 2000 } },
        React.createElement('button', { id: 'sibling-parent' }, 'Parent')),
      open && React.createElement(Confirmation, { close: () => setOpen(false) }),
      React.createElement('button', { id: 'sibling-resize', onClick: () => setCompact(true) }, 'Resize'));
  }
  await mount(Siblings);
  await React.act(async () => doc.getElementById('sibling-resize').click());
  assert.equal(Boolean(doc.getElementById('sibling-cancel').closest('[inert]')), false);
  assert.equal(Boolean(doc.getElementById('sibling-parent').closest('[inert]')), true);
  await key(doc.getElementById('sibling-cancel'), 'Escape');
  assert.equal(doc.querySelector('[role=alertdialog]'), null);
  assert.equal(Boolean(doc.getElementById('sibling-parent').closest('[inert]')), false);
});
