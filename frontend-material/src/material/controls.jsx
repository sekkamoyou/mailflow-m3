import { Children, isValidElement, forwardRef, useId, useRef, useState, useEffect } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';

const ICON_LABELS = {
  "close": "compose.toolbar.close",
  "chevron_right": "message.aiExpand",
  "chevron_left": "common.back",
  "expand_less": "message.aiCollapse",
  "expand_more": "message.aiExpand",
  "star": "message.star",
  "search": "message.find.title",
  "menu": "messageList.menu",
  "add": "common.add",
  "delete": "common.delete",
  "edit": "common.edit",
  "edit_square": "sidebar.compose",
  "refresh": "scheduled.refresh",
  "sync": "messageList.sync",
  "download": "message.preview.download",
  "upload": "admin.notifications.customButton",
  "archive": "message.archive",
  "more_horiz": "message.more",
  "more_vert": "message.more",
  "settings": "sidebar.settings",
  "send": "compose.send",
  "reply": "message.reply",
  "reply_all": "message.replyAll",
  "forward": "message.forward",
  "link": "compose.toolbar.insertLink",
  "content_copy": "common.copy",
  "check": "compose.toolbar.apply",
  "calendar_month": "compose.scheduleSend.pick",
  "minimize": "compose.toolbar.minimize",
  "open_in_new": "contextMenu.openInNewWindow",
  "close_fullscreen": "compose.toolbar.restore",
  "auto_awesome": "message.aiActions",
  "remove": "common.remove",
  "contacts": "contacts.title",
  "visibility": "login.showPassword",
  "visibility_off": "login.hidePassword"
};

// Keep native form events and refs: password managers, Tiptap and the mailbox
// keyboard handlers all depend on the real input/button being the target.
const paint = new Set(['background', 'backgroundColor', 'border', 'borderColor', 'borderRadius', 'boxShadow', 'color', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'outline', 'opacity', 'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'height', 'minHeight', 'transition']);
function layoutStyle(style, button = false) {
  return Object.fromEntries(Object.entries(style || {}).filter(([key, value]) =>
    (!paint.has(key) || (key === 'opacity' && (value === 0 || value === 1))) && !(button && ['width', 'minWidth'].includes(key) && typeof value === 'number' && value < 48)));
}

export function MaterialIcon({ name, size = 24, className = '', style, ...props }) {
  return <span {...props} aria-hidden={props['aria-label'] ? undefined : true} data-icon={name} className={`material-symbols-outlined ${className}`} style={{ fontSize: size, ...style }} />;
}

export function MaterialProgress({ value, label, small = false, style, ...props }) {
  const { t } = useTranslation();
  const progress = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : undefined;
  const active = progress === undefined ? 30 : progress * 100;
  // The rounded caps occupy part of the path. Leave room for both caps and the visible gap.
  const gap = 8;
  const track = progress === 0 ? 100 : Math.max(0, 100 - active - 2 * gap);
  const decorative = props['aria-hidden'] === true || props['aria-hidden'] === 'true';
  return <span {...props} className={`md-progress${small ? ' md-progress-small' : ''}`} style={style}
    role={decorative ? undefined : 'progressbar'} aria-label={decorative ? undefined : label || t('common.loading')}
    aria-valuemin={decorative ? undefined : 0} aria-valuemax={decorative ? undefined : 100}
    aria-valuenow={decorative || progress === undefined ? undefined : Math.round(progress * 100)} data-indeterminate={progress === undefined || undefined}>
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {track > 0 && <circle className="md-progress-track" cx="24" cy="24" r="18" pathLength="100"
        strokeDasharray={track === 100 ? undefined : `${track} 100`} strokeDashoffset={track === 100 ? undefined : -(active + gap)} />}
      {active > 0 && <circle cx="24" cy="24" r="18" pathLength="100"
        strokeDasharray={active === 100 ? undefined : `${active} 100`} />}
    </svg>
  </span>;
}

function ripple(button, event) {
  if (button.disabled || button.getAttribute('aria-disabled') === 'true' || event.defaultPrevented || button.ownerDocument.defaultView.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const circle = button.querySelector('.md-ripple-circle');
  if (!circle?.animate) return;
  const rect = button.getBoundingClientRect();
  const diameter = Math.hypot(rect.width, rect.height) * 2;
  const x = event.type === 'pointerdown' ? event.clientX - rect.left : rect.width / 2;
  const y = event.type === 'pointerdown' ? event.clientY - rect.top : rect.height / 2;
  Object.assign(circle.style, { width: `${diameter}px`, height: `${diameter}px`, left: `${x - diameter / 2}px`, top: `${y - diameter / 2}px` });
  for (const animation of circle.getAnimations()) animation.cancel();
  circle.animate([{ transform: 'scale(0)', opacity: .12 }, { transform: 'scale(1)', opacity: 0 }], { duration: 200, easing: 'cubic-bezier(.34,.80,.34,1)' });
}

export const MaterialButton = forwardRef(function MaterialButton({ variant, size, selected, className = '', style, children, ...props }, ref) {
  const { t } = useTranslation();
  const nodes = Children.toArray(children);
  const icon = nodes.find(node => isValidElement(node) && node.type === MaterialIcon);
  const iconLabel = icon && (ICON_LABELS[icon.props.name] ? t(ICON_LABELS[icon.props.name]) : icon.props.name.replaceAll('_', ' '));
  const background = style?.background || style?.backgroundColor;
  const hasText = nodes => Children.toArray(nodes).some(node => typeof node === 'string' || typeof node === 'number' || (isValidElement(node) && node.type !== 'svg' && node.type !== MaterialIcon && hasText(node.props.children)));
  const isIcon = !hasText(children);
  const swatch = !Children.count(children) && typeof background === 'string' && /^#[0-9a-f]{3,8}$/i.test(background);
  const active = selected ?? props['aria-selected'] ?? props['aria-pressed'];
  const kind = variant || (props.role === 'switch' ? 'switch' : props.role === 'tab' ? 'tab' : props.role === 'menuitem' ? 'menu' : isIcon ? 'icon' : 'text');
  const isGraphic = node => isValidElement(node) && (node.type === MaterialIcon || node.type === 'svg');
  return <button {...props} ref={ref} aria-label={props['aria-label'] || (kind === 'icon' ? props.title || iconLabel || (swatch ? `${t('admin.accounts.color')} ${background}` : undefined) : undefined)}
    onPointerDown={event => { props.onPointerDown?.(event); if (event.button === 0) ripple(event.currentTarget, event); }}
    onKeyDown={event => { props.onKeyDown?.(event); if (!event.repeat && (event.key === 'Enter' || event.key === ' ')) ripple(event.currentTarget, event); }}
    data-material="button" data-variant={kind} data-size={size} data-selected={active ? true : undefined}
    data-leading-icon={!isIcon && isGraphic(nodes[0]) || undefined} data-trailing-icon={!isIcon && isGraphic(nodes.at(-1)) || undefined}
    className={`md-button ${className}`} style={layoutStyle(style, true)}>{kind === 'switch' ? <span className="md-switch-thumb" /> : swatch ? <span aria-hidden="true" className="md-color-swatch" style={{ background }} /> : children}<span aria-hidden="true" className="md-ripple"><span className="md-ripple-circle" /></span></button>;
});

export const MaterialInput = forwardRef(function MaterialInput({ className = '', style, ...props }, ref) {
  const type = props.type || 'text';
  const selection = type === 'checkbox' || type === 'radio';
  const hidden = type === 'hidden' || type === 'file';
  const slider = type === 'range';
  const min = Number(props.min ?? 0);
  const max = Number(props.max ?? 100);
  const progress = value => `${Math.max(0, Math.min(100, (Number(value) - min) / (max - min) * 100 || 0))}%`;
  return <input {...props} ref={ref} aria-label={props['aria-label'] || (!props.id ? props.placeholder : undefined) || undefined}
    className={`${selection ? 'md-selection' : hidden ? '' : slider ? 'md-slider' : 'md-input'} ${className}`}
    data-material={selection ? type : hidden ? undefined : slider ? 'slider' : 'field'}
    onInput={event => { if (slider) event.currentTarget.style.setProperty('--md-slider-progress', progress(event.currentTarget.value)); props.onInput?.(event); }}
    style={hidden ? style : selection ? undefined : { ...layoutStyle(style), ...(slider ? { '--md-slider-progress': progress(props.value ?? props.defaultValue ?? (min + max) / 2) } : {}) }} />;
});

export const MaterialSelect = forwardRef(function MaterialSelect({ className = '', style, children, ...props }, ref) {
  const input = useRef(null);
  const [open, setOpen] = useState(false);
  const id = useId();
  const custom = !props.multiple && !(props.size > 1) && !globalThis.CSS?.supports?.('appearance', 'base-select');
  const show = () => { if (custom && !props.disabled) setOpen(true); };
  const close = (restore = true) => { setOpen(false); if (restore) input.current?.focus({ preventScroll: true }); };
  return <><select {...props} ref={node => { input.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }}
    className={`md-input md-select ${className}`} data-material="select" style={layoutStyle(style)}
    aria-expanded={custom ? open : props['aria-expanded']} aria-controls={open ? id : undefined}
    onMouseDown={event => {
      props.onMouseDown?.(event);
      if (custom && event.button === 0 && !event.defaultPrevented) { event.preventDefault(); input.current.focus({ preventScroll: true }); }
    }}
    onClick={event => { props.onClick?.(event); if (custom && !props.disabled && !event.defaultPrevented) { event.preventDefault(); setOpen(value => !value); } }}
    onKeyDown={event => {
      props.onKeyDown?.(event);
      // Escape dismisses an open native picker before the enclosing dialog.
      if (!custom && event.key === 'Escape' && event.currentTarget.matches(':open')) event.stopPropagation();
      if (custom && !event.defaultPrevented && (event.key === ' ' || event.key === 'Enter' || (event.altKey && event.key === 'ArrowDown'))) {
        event.preventDefault(); show();
      }
    }}>{children}</select>
    {open && createPortal(<SelectPopup id={id} input={input.current} onClose={close} />, input.current.closest('[aria-modal="true"]') || input.current.ownerDocument.body)}
  </>;
});

function SelectPopup({ id, input, onClose }) {
  const panel = useRef(null);
  const search = useRef({ text: '', at: 0 });
  const options = [...input.options].map((option, index) => ({ option, index }))
    .filter(({ option }) => !option.hidden && !option.closest('optgroup')?.hidden);
  const enabled = options.filter(({ option }) => !option.disabled && !option.closest('optgroup')?.disabled);
  const [active, setActive] = useState(() => enabled.find(({ index }) => index === input.selectedIndex)?.index ?? enabled[0]?.index);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => { (panel.current?.querySelector('[tabindex="0"]') || panel.current)?.focus({ preventScroll: true }); }, [active]);
  useEffect(() => {
    const doc = input.ownerDocument;
    const outside = event => { if (!panel.current?.contains(event.target) && event.target !== input) closeRef.current(false); };
    const reposition = event => { if (!panel.current?.contains(event.target)) closeRef.current(false); };
    doc.addEventListener('pointerdown', outside, true);
    doc.addEventListener('scroll', reposition, true);
    doc.defaultView.addEventListener('resize', reposition);
    return () => {
      doc.removeEventListener('pointerdown', outside, true);
      doc.removeEventListener('scroll', reposition, true);
      doc.defaultView.removeEventListener('resize', reposition);
    };
  }, [input]);
  const choose = index => {
    input.selectedIndex = index;
    input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
    input.dispatchEvent(new input.ownerDocument.defaultView.Event('change', { bubbles: true }));
    onClose();
  };
  const rect = input.getBoundingClientRect();
  const view = input.ownerDocument.defaultView;
  const below = view.innerHeight - rect.bottom - 8;
  const above = rect.top - 8;
  const upwards = below < 200 && above > below;
  const maxHeight = Math.max(48, Math.min(360, upwards ? above : below));
  const width = Math.min(Math.max(rect.width, 112), view.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.left, view.innerWidth - width - 8));
  // A scaled app or animated modal becomes the fixed containing block.
  let originX = 0, originY = 0, scaleX = 1, scaleY = 1;
  for (let box = input.closest('[aria-modal="true"]') || input.ownerDocument.body; box; box = box.parentElement) {
    const transform = view.getComputedStyle(box).transform;
    if (!transform || transform === 'none') continue;
    const bounds = box.getBoundingClientRect();
    scaleX = bounds.width / (box.offsetWidth || bounds.width) || 1;
    scaleY = bounds.height / (box.offsetHeight || bounds.height) || 1;
    originX = bounds.left + box.clientLeft * scaleX;
    originY = bounds.top + box.clientTop * scaleY;
    break;
  }
  const labelledBy = input.getAttribute('aria-labelledby');
  const name = input.getAttribute('aria-label') || [...(input.labels || [])].map(label => label.textContent).join(' ') || input.title;
  return <div ref={panel} id={id} role="listbox" tabIndex={-1} className="md-select-popup" aria-label={labelledBy ? undefined : name} aria-labelledby={labelledBy || undefined}
    style={{ position: 'fixed', zIndex: 21000, left: (left - originX) / scaleX, width: width / scaleX, maxHeight: maxHeight / scaleY,
      top: ((upwards ? rect.top : rect.bottom) - originY) / scaleY, transform: upwards ? 'translateY(-100%)' : undefined }}
    onClick={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()}
    onKeyDown={event => {
      // Let the parent modal see Tab after the popup options leave its focus order.
      if (event.key === 'Tab') { flushSync(() => onClose()); return; }
      event.stopPropagation();
      const at = enabled.findIndex(({ index }) => index === active);
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!event.repeat && active !== undefined) choose(active); return; }
      let next;
      if (event.key === 'ArrowDown') next = enabled[(at + 1) % enabled.length];
      else if (event.key === 'ArrowUp') next = enabled[(at - 1 + enabled.length) % enabled.length];
      else if (event.key === 'Home') next = enabled[0];
      else if (event.key === 'End') next = enabled.at(-1);
      else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const time = Date.now();
        const text = time - search.current.at > 500 ? event.key : search.current.text + event.key;
        search.current = { text, at: time };
        const prefix = [...text].every(letter => letter === text[0]) ? text[0] : text;
        next = [...enabled.slice(at + 1), ...enabled.slice(0, at + 1)].find(({ option }) => option.label.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase()));
      }
      if (next) { event.preventDefault(); setActive(next.index); }
    }}>
    {options.map(({ option, index }) => <MaterialButton key={index} variant="menu" type="button" role="option"
      aria-selected={index === input.selectedIndex} disabled={option.disabled || option.closest('optgroup')?.disabled}
      tabIndex={index === active ? 0 : -1} onClick={() => choose(index)}>{option.label}</MaterialButton>)}
  </div>;
}

export const MaterialTextarea = forwardRef(function MaterialTextarea({ className = '', style, ...props }, ref) {
  return <textarea {...props} ref={ref} aria-label={props['aria-label'] || (!props.id ? props.placeholder : undefined) || undefined}
    className={`md-input md-textarea ${className}`} data-material="field" style={layoutStyle(style)} />;
});
