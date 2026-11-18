import { useCallback, useEffect, useRef, useState } from 'react';

const modalStack = [];
const isolated = new Set();
let isolationObserver;

function isolateModal(records = []) {
  // A React view can change its own inert state while another modal is open.
  for (const record of [...records, ...(isolationObserver?.takeRecords() || [])]) {
    if (record.type === 'attributes') isolated.delete(record.target);
  }
  isolationObserver?.disconnect();
  for (const node of isolated) node.removeAttribute('inert');
  isolated.clear();
  const panel = modalStack.at(-1)?.panel;
  if (!panel?.isConnected) return;
  // Inert siblings at every level, including React portals and nested dialogs.
  for (let branch = panel; branch.parentElement; branch = branch.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (sibling === branch || sibling.hasAttribute('inert') || sibling.hasAttribute('data-modal-scrim')) continue;
      sibling.setAttribute('inert', '');
      isolated.add(sibling);
    }
    if (branch.parentElement === panel.ownerDocument.body) break;
  }
  isolationObserver?.observe(panel.ownerDocument.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['inert'] });
}
const FOCUSABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableIn(panel) {
  const nodes = [...panel.querySelectorAll(FOCUSABLE)];
  return nodes.filter(node => {
    if (node.disabled || node.matches(':disabled') || (node.hasAttribute('tabindex') && node.tabIndex < 0)
      || node.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    if (node.type === 'radio' && node.name) {
      const group = nodes.filter(candidate => candidate.type === 'radio' && candidate.name === node.name && candidate.form === node.form);
      if (group.some(candidate => candidate.checked) ? !node.checked : node !== group[0]) return false;
    }
    for (let ancestor = node; ancestor && ancestor !== panel.parentElement; ancestor = ancestor.parentElement) {
      const style = ancestor.ownerDocument.defaultView?.getComputedStyle(ancestor);
      if (style?.display === 'none' || style?.visibility === 'hidden') return false;
      if (ancestor === panel) break;
    }
    return true;
  });
}

/** Keep keyboard focus in one open modal. Return value is the panel ref to attach. */
export function useModalFocus({ enabled = true, onEscape, initialFocusRef, returnFocusRef } = {}) {
  const [panel, setPanel] = useState(null);
  const previousPanel = useRef(null);
  const opener = useRef(null);
  // A responsive view may replace the DOM panel without closing the modal.
  const panelRef = useCallback(node => {
    if (node) {
      if (!previousPanel.current?.contains(node.ownerDocument.activeElement)) opener.current = node.ownerDocument.activeElement;
      previousPanel.current = node;
    }
    panelRef.current = node;
    setPanel(node);
  }, []);
  const onEscapeRef = useRef(onEscape);
  const initialFocusRefRef = useRef(initialFocusRef);
  onEscapeRef.current = onEscape;
  initialFocusRefRef.current = initialFocusRef;

  useEffect(() => {
    if (!enabled || !panel) return undefined;
    const doc = panel.ownerDocument;
    const record = { panel, restoreTo: returnFocusRef?.current || (panel.contains(doc.activeElement) ? opener.current : doc.activeElement) };
    // Responsive composers can remount below an already open sibling sheet.
    const childIndex = modalStack.findIndex(record => panel.contains(record.panel)
      || (panel.parentElement === record.panel.parentElement
        && Number(doc.defaultView.getComputedStyle(panel).zIndex) < Number(doc.defaultView.getComputedStyle(record.panel).zIndex)));
    if (childIndex < 0) modalStack.push(record);
    else modalStack.splice(childIndex, 0, record);
    isolateModal();
    if (!isolationObserver) {
      isolationObserver = new doc.defaultView.MutationObserver(isolateModal);
      isolationObserver.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['inert'] });
    }

    // Preserve autofocus or a control that already received focus during mounting.
    let addedPanelTabindex = false;
    if (!panel.contains(doc.activeElement)) {
      const preferred = initialFocusRefRef.current?.current
        || panel.querySelector('[autofocus], [data-autofocus]')
        || focusableIn(panel)[0]
        || panel;
      addedPanelTabindex = preferred === panel && !panel.hasAttribute('tabindex');
      if (addedPanelTabindex) panel.setAttribute('tabindex', '-1');
      preferred.focus?.({ preventScroll: true });
    }

    const onKeyDown = event => {
      if (event.defaultPrevented || modalStack.at(-1) !== record) return;
      // Existing pickers can be sibling portals with their own local focus trap.
      const owner = event.target.closest?.('[aria-modal="true"]');
      if (owner && owner !== panel) return;
      if (event.key === 'Escape' && onEscapeRef.current) {
        event.preventDefault();
        onEscapeRef.current(event);
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = focusableIn(panel);
      if (!controls.length) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = controls[0];
      const last = controls.at(-1);
      const active = doc.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    const onFocusIn = event => {
      if (modalStack.at(-1) === record && !panel.contains(event.target)) {
        (focusableIn(panel)[0] || panel).focus({ preventScroll: true });
      }
    };
    doc.addEventListener('keydown', onKeyDown);
    doc.addEventListener('focusin', onFocusIn);

    return () => {
      doc.removeEventListener('keydown', onKeyDown);
      doc.removeEventListener('focusin', onFocusIn);
      const wasTop = modalStack.at(-1) === record;
      const index = modalStack.indexOf(record);
      if (index !== -1) modalStack.splice(index, 1);
      isolateModal();
      if (!modalStack.length) {
        isolationObserver?.disconnect();
        isolationObserver = undefined;
      }
      if (addedPanelTabindex) panel.removeAttribute('tabindex');
      const next = modalStack.at(-1);
      if (!wasTop) return;
      if (record.restoreTo?.isConnected && (!next || next.panel.contains(record.restoreTo))) {
        record.restoreTo.focus?.({ preventScroll: true });
      } else if (next && !next.panel.contains(doc.activeElement)) {
        (focusableIn(next.panel)[0] || next.panel).focus({ preventScroll: true });
      }
    };
  }, [enabled, panel, returnFocusRef]);

  return panelRef;
}
