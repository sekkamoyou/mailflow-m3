import { useEffect, useLayoutEffect, useRef } from 'react';

function widthLimit(handle, max, reserve, reservePane) {
  if (!reserve) return max;
  const reservedWidth = handle.ownerDocument.getElementById(reservePane)?.offsetWidth || 0;
  return Math.min(max, handle.parentElement.clientWidth - reserve - reservedWidth);
}

export default function PaneResizeHandle({
  paneId, label, min, max, scale, reverse = false, reserve = 0, reservePane,
  onCommit, onPreview = onCommit, onDragState,
}) {
  const ref = useRef(null);
  const drag = useRef(null);

  useLayoutEffect(() => {
    const handle = ref.current;
    const pane = handle.ownerDocument.getElementById(paneId);
    if (!pane) return undefined;
    const sync = () => {
      const width = pane.offsetWidth;
      if (!width) return;
      handle.setAttribute('aria-valuenow', Math.max(min, width));
      handle.setAttribute('aria-valuemax', Math.max(min, width, widthLimit(handle, max, reserve, reservePane)));
    };
    sync();
    const Observer = handle.ownerDocument.defaultView.ResizeObserver;
    if (!Observer) return undefined;
    const observer = new Observer(sync);
    observer.observe(pane);
    observer.observe(handle.parentElement);
    const peer = handle.ownerDocument.getElementById(reservePane);
    if (peer) observer.observe(peer);
    return () => observer.disconnect();
  }, [paneId, min, max, reserve, reservePane]);

  useEffect(() => () => { drag.current?.finish(drag.current.width); }, []);
  const limit = handle => Math.max(min, widthLimit(handle, max, reserve, reservePane));
  const clamp = (width, handle) => Math.max(min, Math.min(limit(handle), width));
  const read = handle => handle.ownerDocument.getElementById(paneId)?.offsetWidth;
  const direction = reverse ? -1 : 1;

  return <div ref={ref} className="material-pane-resize" role="separator" tabIndex={0}
    aria-orientation="vertical" aria-controls={paneId} aria-label={label} aria-valuemin={min}
    onKeyDown={event => {
      const handle = event.currentTarget;
      const step = (event.shiftKey ? 32 : 8) * direction;
      const width = read(handle);
      if (!width) return;
      const next = { ArrowLeft: width - step, ArrowRight: width + step, Home: min, End: limit(handle) }[event.key];
      if (typeof next !== 'number') return;
      event.preventDefault();
      event.stopPropagation();
      onCommit(clamp(next, handle));
    }}
    onPointerDown={event => {
      if (event.button !== 0 || drag.current) return;
      event.preventDefault();
      const handle = event.currentTarget;
      const width = read(handle);
      if (!width) return;
      handle.setPointerCapture(event.pointerId);
      handle.dataset.dragging = '';
      drag.current = {
        x: event.clientX, start: width, width, id: event.pointerId,
        finish: finalWidth => {
          delete handle.dataset.dragging;
          onDragState?.(false);
          if (finalWidth !== width) onCommit(finalWidth);
        },
      };
      onDragState?.(true);
    }}
    onPointerMove={event => {
      const active = drag.current;
      if (active?.id !== event.pointerId) return;
      const width = clamp(active.start + Math.round((event.clientX - active.x) * direction / scale), event.currentTarget);
      if (width === active.width) return;
      active.width = width;
      onPreview(width);
    }}
    onLostPointerCapture={event => {
      const active = drag.current;
      if (active?.id !== event.pointerId) return;
      drag.current = null;
      active.finish(active.width);
    }}
  />;
}
