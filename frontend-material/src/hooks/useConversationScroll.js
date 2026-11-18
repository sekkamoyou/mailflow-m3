import { useLayoutEffect } from 'react';

// Keep the picked card visible as its body gets its real height, until the reader takes over.
export function useConversationScroll(stackRef, selectedId, membershipKey) {
  useLayoutEffect(() => {
    const stack = stackRef.current;
    const card = [...(stack?.children || [])].find(child => child.dataset.messageId === selectedId);
    if (!card) return undefined;
    let active = true;
    let alignedTop = stack.scrollTop;
    const align = () => {
      if (!active) return;
      const top = card.offsetTop;
      const bottom = top + card.offsetHeight;
      if (top < stack.scrollTop) stack.scrollTop = top;
      else if (bottom > stack.scrollTop + stack.clientHeight) {
        stack.scrollTop = card.offsetHeight > stack.clientHeight ? top : bottom - stack.clientHeight;
      }
      alignedTop = stack.scrollTop;
    };
    align();
    const Observer = stack.ownerDocument.defaultView.ResizeObserver;
    const observer = Observer ? new Observer(align) : null;
    observer?.observe(card);
    // Frame heights are applied after parsing; include those writes before the next paint.
    const changes = new stack.ownerDocument.defaultView.MutationObserver(align);
    changes.observe(card, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
    const stop = () => { active = false; observer?.disconnect(); changes.disconnect(); };
    const onScroll = event => {
      if (event.target === stack && Math.abs(stack.scrollTop - alignedTop) > 1) stop();
    };
    stack.addEventListener('scroll', onScroll, { passive: true });
    stack.addEventListener('touchstart', stop, { passive: true });
    stack.addEventListener('pointerdown', stop, { passive: true });
    stack.addEventListener('wheel', stop, { passive: true });
    stack.addEventListener('keydown', stop);
    return () => {
      stop();
      stack.removeEventListener('scroll', onScroll);
      stack.removeEventListener('touchstart', stop);
      stack.removeEventListener('pointerdown', stop);
      stack.removeEventListener('wheel', stop);
      stack.removeEventListener('keydown', stop);
    };
  }, [stackRef, selectedId, membershipKey]);
}
