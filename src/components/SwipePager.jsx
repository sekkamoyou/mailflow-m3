import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import SwipeMessagePreview from './SwipeMessagePreview.jsx';

// Native scrolling chains out of sandboxed email frames without enabling their scripts.
// Commit at scrollend, after the finger and inertia finish, never while passing a page edge.
export default function SwipePager({ enabled, prev, next, navKey, onNavigate, children }) {
  const pagerRef = useRef(null);
  const currentRef = useRef(null);
  const [zoomed, setZoomed] = useState(false);
  const recentering = useRef(false);
  const navigating = useRef(false);
  const resetTimer = useRef(null);
  const latest = useRef({});
  latest.current = { onNavigate };

  const recentre = useCallback(() => {
    const el = pagerRef.current;
    if (!el || !currentRef.current) return;
    clearTimeout(resetTimer.current);
    recentering.current = true;
    // Changing the end pages must not re-snap to the old neighbor after the reset.
    el.style.scrollSnapType = 'none';
    el.scrollLeft = currentRef.current.offsetLeft;
    el.style.scrollSnapType = 'x mandatory';
    resetTimer.current = setTimeout(() => {
      recentering.current = false;
      navigating.current = false;
    }, 0);
  }, []);

  useLayoutEffect(() => {
    if (!enabled) return undefined;
    recentre();
    return () => clearTimeout(resetTimer.current);
  }, [enabled, navKey, Boolean(prev), recentre]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) return undefined;
    const el = pagerRef.current;
    let timer = null;
    let touching = false;
    const nativeEnd = 'onscrollend' in el;
    const settle = () => {
      timer = null;
      if (recentering.current || navigating.current || touching || zoomed) return;
      const current = currentRef.current;
      const delta = el.scrollLeft - current.offsetLeft;
      if (Math.abs(delta) < el.clientWidth / 2) return;
      const target = delta < 0 ? current.previousElementSibling : current.nextElementSibling;
      if (!target || Math.abs(el.scrollLeft - target.offsetLeft) > 2) return;
      navigating.current = true;
      if (!latest.current.onNavigate(delta < 0 ? 'prev' : 'next')) recentre();
    };
    // Older engines without scrollend retain a quiet-scroll fallback.
    const onScroll = event => {
      if (event.target !== el || nativeEnd) return;
      clearTimeout(timer);
      timer = setTimeout(settle, 250);
    };
    const onScrollEnd = event => {
      if (event.target !== el) return;
      clearTimeout(timer);
      settle();
    };
    const onTouchStart = () => { touching = true; clearTimeout(timer); };
    const onTouchEnd = () => {
      touching = false;
      if (!nativeEnd) { clearTimeout(timer); timer = setTimeout(settle, 250); }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('scrollend', onScrollEnd);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    const Observer = el.ownerDocument.defaultView.ResizeObserver;
    const ro = Observer ? new Observer(recentre) : null;
    ro?.observe(el);
    const vv = el.ownerDocument.defaultView.visualViewport;
    const onZoom = () => setZoomed((vv?.scale ?? 1) > 1.01);
    onZoom();
    vv?.addEventListener('resize', onZoom);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('scrollend', onScrollEnd);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      ro?.disconnect();
      vv?.removeEventListener('resize', onZoom);
    };
  }, [enabled, recentre, zoomed]);

  if (!enabled) return children;
  const peek = (row, side) => row && <div aria-hidden="true" data-swipe-peek={side}
    style={{ flex: '0 0 100%', minWidth: 0, overflow: 'hidden', scrollSnapAlign: 'start', scrollSnapStop: 'always' }}>
    <SwipeMessagePreview key={row.id} row={row} />
  </div>;
  return <div style={{ position: 'relative', flex: 1, minHeight: 0, minWidth: 0, display: 'flex' }}>
    <div ref={pagerRef} data-swipe-pager="" tabIndex={0} className="swipe-pager" style={{
      position: 'relative', flex: 1, minWidth: 0, display: 'flex',
      overflowX: zoomed ? 'hidden' : 'auto', overflowY: 'hidden',
      scrollSnapType: 'x mandatory', overscrollBehaviorX: 'contain',
    }}>
      {peek(prev, 'prev')}
      <div ref={currentRef} style={{ flex: '0 0 100%', minWidth: 0, display: 'flex', flexDirection: 'column', scrollSnapAlign: 'start', scrollSnapStop: 'always' }}>{children}</div>
      {peek(next, 'next')}
    </div>
    {/* The left edge belongs to the back gesture, including over the email frame. */}
    <div data-swipe-edge="" aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 16, zIndex: 2, touchAction: 'pan-y' }} />
  </div>;
}
