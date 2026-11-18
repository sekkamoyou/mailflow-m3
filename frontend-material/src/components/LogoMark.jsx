export default function LogoMark({ size = 32 }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style={{ display: 'block', flexShrink: 0 }}>
    <rect width="32" height="32" rx="8" fill="var(--md-sys-color-primary-container)" />
    <rect x="6" y="9" width="20" height="14" rx="2" fill="var(--md-sys-color-primary)" />
    <path d="M7 10.5 16 17 25 10.5" fill="none" stroke="var(--md-sys-color-primary-container)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
