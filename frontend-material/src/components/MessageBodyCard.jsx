export default function MessageBodyCard({ children, isMobile, shownDark, surface }) {
  return <div className="msg-card" style={{
    position: 'relative', padding: '14px 16px 12px',
    background: shownDark ? (surface || 'var(--bg-primary)') : 'white',
    borderRadius: isMobile ? 0 : 10,
    border: isMobile || shownDark ? 'none' : '1px solid var(--border-subtle)',
    overflow: 'hidden', contain: 'layout',
  }}>{children}</div>;
}

function linkifyText(text) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(
    /https?:\/\/[^\s<>"']+/g,
    url => `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:inherit">${url}</a>`
  );
}

export function MessageTextBody({ text, isMobile, dark }) {
  return (
          <div className="msg-card" style={{
            margin: 0, padding: '14px 16px 12px',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            fontSize: 'var(--md-sys-typescale-body-medium-size)', color: dark ? 'var(--text-primary)' : '#1a1a1a', lineHeight: 1.7,
            fontFamily: 'DM Sans, sans-serif', background: dark ? 'var(--bg-primary)' : 'white',
            borderRadius: isMobile ? 0 : 10,
            border: isMobile || dark ? 'none' : '1px solid var(--border-subtle)',
            overflow: 'hidden',
          }}
            // <body> is translate="no" so a browser translator cannot break React's DOM (see
            // index.html). A message someone sent in another language should still translate,
            // and React writes this body in one piece, so the translator has nothing of React's
            // to break in here.
            translate="yes"
            dangerouslySetInnerHTML={{ __html: linkifyText(text) }}
          />
  );
}
