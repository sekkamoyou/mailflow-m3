import { useModalFocus } from './useModalFocus.js';

export default function MaterialDialog({ onClose, sheet = false, role = 'dialog', className = '', style, children, ...props }) {
  const ref = useModalFocus({ onEscape: onClose });
  return <div {...props} ref={ref} role={role} aria-modal="true"
    className={`${sheet ? 'md-bottom-sheet' : 'md-dialog'} ${className}`} style={style}>{children}</div>;
}
