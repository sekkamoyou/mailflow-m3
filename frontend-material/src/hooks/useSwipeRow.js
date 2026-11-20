import { useRef, useEffect, useCallback } from 'react';

const SWIPE_THRESHOLD = 72;

export function isInteractiveSwipeTarget(target) {
  return Boolean(target?.closest?.('button:not([data-message-open]), input, select, textarea, a, [role="button"]'));
}

export function useSwipeRow({ isMobile, message, onSwipeLeft, onSwipeRight, onLongPress, onTap, onGesture }) {
  const contentRef = useRef(null);
  const swipeBgLeftRef = useRef(null);
  const swipeBgRightRef = useRef(null);
  const swipeRef = useRef({ active: false, startX: 0, startY: 0, dir: null, x: 0, interactive: false });
  const longPressTimerRef = useRef(null);
  const springBackTimerRef = useRef(null);
  const longPressActivatedRef = useRef(false);
  const tapSuppressTimerRef = useRef(null);
  const latestRef = useRef({});
  // tappedRef is set to true when onTap fires so the subsequent click event can be
  // suppressed — prevents handleSelect from being called twice on the same tap.
  const tappedRef = useRef(false);
  latestRef.current = { message, onSwipeLeft, onSwipeRight, onLongPress, onTap, onGesture };

  const springBack = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    if (springBackTimerRef.current) clearTimeout(springBackTimerRef.current);
    el.style.transition = 'transform 0.25s cubic-bezier(0.25,0.46,0.45,0.94)';
    el.style.transform = 'translateX(0)';
    el.style.boxShadow = '';
    springBackTimerRef.current = setTimeout(() => {
      springBackTimerRef.current = null;
      if (swipeBgLeftRef.current)  { swipeBgLeftRef.current.style.display = 'none'; swipeBgLeftRef.current.style.opacity = '1'; }
      if (swipeBgRightRef.current) { swipeBgRightRef.current.style.display = 'none'; swipeBgRightRef.current.style.opacity = '1'; }
    }, 260);
  }, []);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const doc = el.ownerDocument;
    let clickGuardTimer = null;
    const clearClickGuard = () => {
      clearTimeout(clickGuardTimer);
      doc.removeEventListener('click', blockGestureClick, true);
      doc.removeEventListener('pointerdown', clearClickGuard, true);
      doc.removeEventListener('touchstart', clearClickGuard, true);
      doc.removeEventListener('touchend', finishClickGuard, true);
      doc.removeEventListener('touchcancel', finishClickGuard, true);
    };
    const blockGestureClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      tappedRef.current = false;
      clearClickGuard();
    };
    const finishClickGuard = () => { clickGuardTimer = setTimeout(clearClickGuard, 350); };
    // Selection can move the touched row under a different button before release.
    const guardGestureClick = () => {
      clearClickGuard();
      doc.addEventListener('click', blockGestureClick, true);
      doc.addEventListener('pointerdown', clearClickGuard, true);
      doc.addEventListener('touchstart', clearClickGuard, true);
      doc.addEventListener('touchend', finishClickGuard, { capture: true, once: true, passive: true });
      doc.addEventListener('touchcancel', finishClickGuard, { capture: true, once: true, passive: true });
    };

    const showBgs = () => {
      if (swipeBgLeftRef.current)  { swipeBgLeftRef.current.style.display = 'flex'; swipeBgLeftRef.current.style.opacity = '0'; }
      if (swipeBgRightRef.current) { swipeBgRightRef.current.style.display = 'flex'; swipeBgRightRef.current.style.opacity = '0'; }
    };
    const hideBgs = () => {
      if (swipeBgLeftRef.current)  swipeBgLeftRef.current.style.display = 'none';
      if (swipeBgRightRef.current) swipeBgRightRef.current.style.display = 'none';
    };
    const cancelLongPress = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
    const resetSwipeState = () => {
      swipeRef.current = { active: false, startX: 0, startY: 0, dir: null, x: 0, interactive: false };
    };
    const suppressNextClick = () => {
      if (tapSuppressTimerRef.current) clearTimeout(tapSuppressTimerRef.current);
      tappedRef.current = true;
      tapSuppressTimerRef.current = setTimeout(() => {
        tappedRef.current = false;
        tapSuppressTimerRef.current = null;
      }, 300);
    };

    const onStart = (e) => {
      cancelLongPress();
      if (tapSuppressTimerRef.current) clearTimeout(tapSuppressTimerRef.current);
      tappedRef.current = false;
      if (e.touches.length !== 1) { swipeRef.current = { consumed: true }; return; }
      const t = e.touches[0];
      if (springBackTimerRef.current) {
        clearTimeout(springBackTimerRef.current);
        springBackTimerRef.current = null;
      }
      longPressActivatedRef.current = false;
      const interactive = isInteractiveSwipeTarget(e.target);
      swipeRef.current = { active: false, startX: t.clientX, startY: t.clientY, dir: null, x: 0, interactive };
      showBgs();
      const avatar = e.target.closest?.('.md-sender-avatar');
      if ((avatar || (isMobile && !interactive)) && latestRef.current.onLongPress) {
        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null;
          longPressActivatedRef.current = true;
          guardGestureClick();
          suppressNextClick();
          springBack();
          latestRef.current.onLongPress?.(latestRef.current.message.id);
        }, 500);
      }
    };

    const onMove = (e) => {
      const s = swipeRef.current;
      if (s.consumed || !e.touches.length) return;
      const t = e.touches[0];
      const dx = t.clientX - s.startX;
      const dy = t.clientY - s.startY;
      if (!s.dir) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        cancelLongPress();
        s.dir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      }
      if (latestRef.current.onGesture) {
        // A small diagonal start is still a scroll, not an instruction to leave selection.
        if (s.dir === 'h' && Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
          s.consumed = true;
          guardGestureClick();
          suppressNextClick();
          latestRef.current.onGesture();
        }
        return;
      }
      if (s.interactive || !isMobile) return;
      if (s.dir === 'v') return;
      if ((dx < 0 && !latestRef.current.onSwipeLeft) || (dx > 0 && !latestRef.current.onSwipeRight)) return;
      e.preventDefault();
      s.active = true;
      s.x = Math.max(-160, Math.min(160, dx));
      el.style.transition = 'none';
      el.style.transform = `translateX(${s.x}px)`;
      const progress = Math.min(Math.abs(s.x) / SWIPE_THRESHOLD, 1);
      const iconScale = 0.7 + 0.3 * progress;
      if (s.x > 0 && swipeBgLeftRef.current) {
        swipeBgLeftRef.current.style.opacity = String(0.3 + 0.7 * progress);
        const icon = swipeBgLeftRef.current.querySelector('svg');
        if (icon) icon.style.transform = `scale(${iconScale})`;
      } else if (s.x < 0 && swipeBgRightRef.current) {
        swipeBgRightRef.current.style.opacity = String(0.3 + 0.7 * progress);
        const icon = swipeBgRightRef.current.querySelector('svg');
        if (icon) icon.style.transform = `scale(${iconScale})`;
      }
      el.style.boxShadow = progress > 0.1 ? `0 4px 20px rgba(0,0,0,${0.3 * progress})` : '';
    };

    const onEnd = () => {
      cancelLongPress();
      const s = swipeRef.current;
      if (longPressActivatedRef.current || s.consumed) {
        suppressNextClick();
        resetSwipeState();
        springBack();
        return;
      }
      if (!s.active) {
        const wasTap = !s.dir && !s.interactive;
        resetSwipeState();
        hideBgs();
        // Fire onTap immediately on touchend instead of waiting for the synthesized
        // click — eliminates any browser tap-delay and ensures the optimistic
        // mark-as-read update happens before back navigation can race against it.
        // Only true taps should navigate; vertical scrolls and aborted horizontal
        // drags must not open rows while the user is just swiping around.
        // Skip if a long press just activated (entering selection mode) so we don't
        // also navigate while React is still re-rendering the selection state.
        if (wasTap && latestRef.current.onTap && !longPressActivatedRef.current) {
          suppressNextClick();
          latestRef.current.onTap(latestRef.current.message);
        }
        return;
      }
      const x = s.x;
      resetSwipeState();
      springBack();
      if (x < -SWIPE_THRESHOLD) {
        latestRef.current.onSwipeLeft?.(latestRef.current.message);
      } else if (x > SWIPE_THRESHOLD) {
        latestRef.current.onSwipeRight?.(latestRef.current.message);
      }
    };

    const onCancel = () => {
      cancelLongPress();
      resetSwipeState();
      longPressActivatedRef.current = false;
      springBack();
    };

    const bgLeft = swipeBgLeftRef.current;
    const bgRight = swipeBgRightRef.current;
    if (isMobile) el.style.touchAction = 'pan-y';
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      clearClickGuard();
      cancelLongPress();
      if (tapSuppressTimerRef.current) {
        clearTimeout(tapSuppressTimerRef.current);
        tapSuppressTimerRef.current = null;
      }
      tappedRef.current = false;
      if (springBackTimerRef.current) {
        clearTimeout(springBackTimerRef.current);
        springBackTimerRef.current = null;
      }
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
      el.style.touchAction = '';
      el.style.transform = 'translateX(0)';
      el.style.transition = '';
      el.style.boxShadow = '';
      if (bgLeft)  bgLeft.style.display = 'none';
      if (bgRight) bgRight.style.display = 'none';
    };
  }, [isMobile, springBack]);

  return { contentRef, swipeBgLeftRef, swipeBgRightRef, springBack, tappedRef };
}
