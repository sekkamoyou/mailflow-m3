import { useEffect, useRef } from 'react';

export function useMenuFocus(menuRef, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return undefined;
    const doc = menu.ownerDocument;
    const opener = doc.activeElement;
    const items = () => [...menu.querySelectorAll('[role="menuitem"]:not(:disabled):not([aria-disabled="true"])')];
    items()[0]?.focus();
    const onKey = event => {
      if (!menu.contains(event.target)) return;
      const entries = items();
      const at = entries.indexOf(doc.activeElement);
      let next;
      if (event.key === 'ArrowDown') next = (at + 1) % entries.length;
      else if (event.key === 'ArrowUp') next = (at - 1 + entries.length) % entries.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = entries.length - 1;
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); opener?.focus?.(); }
      else if (event.key === 'Tab') closeRef.current();
      else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        next = entries.findIndex((_, offset) => entries[(at + 1 + offset) % entries.length].textContent.trim().toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
        next = next < 0 ? undefined : (at + 1 + next) % entries.length;
      }
      if (next !== undefined) { event.preventDefault(); event.stopPropagation(); entries[next]?.focus(); }
    };
    menu.addEventListener('keydown', onKey);
    return () => {
      menu.removeEventListener('keydown', onKey);
      // Tab and outside clicks keep the user's newly chosen focus.
      if (menu.contains(doc.activeElement) || doc.activeElement === doc.body) opener?.focus?.();
    };
  }, [menuRef]);
}
