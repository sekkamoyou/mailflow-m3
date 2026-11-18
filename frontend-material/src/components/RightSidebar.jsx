import { MaterialIcon } from '../material/controls.jsx';
import { MaterialButton } from '../material/controls.jsx';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function RightSidebar({ title, headerAccessory, onCollapse, toggleHint, children }) {
  const { t } = useTranslation();
  const [collapseHover, setCollapseHover] = useState(false);

  // Expanding multiple sections can make the content taller than the viewport.
  // Reserve the scrollbar gutter so right-anchored header and row content does not jump.
  return (
    <div style={{
      width: 'var(--right-sidebar-width, 296px)', flexShrink: 0,
      borderLeft: '1px solid var(--border)', background: 'var(--bg-secondary)',
      display: 'flex', flexDirection: 'column', overflowY: 'auto', height: '100%',
      scrollbarGutter: 'stable',
      // Rendered height of the sticky header below (10+10 padding + 29px button +
      // 1px border-bottom). Published as a CSS var so child-feature sticky offsets
      // derive from the shell's own geometry rather than a cross-file magic number;
      // keep this in sync if the header's box changes.
      '--right-sidebar-header-height': '50px',
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', gap: 8, position: 'sticky', top: 0,
        background: 'var(--bg-secondary)', zIndex: 3,
      }}>
        <b style={{ fontSize: 'var(--md-sys-typescale-body-small-size)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          {title}
        </b>
        {headerAccessory}
        <MaterialButton variant="icon"
          onClick={onCollapse}
          aria-label={t('rightSidebar.hide')}
          title={toggleHint ? `${t('rightSidebar.hide')} (${toggleHint})` : t('rightSidebar.hide')}
          className="btn-press"
          onMouseEnter={() => setCollapseHover(true)}
          onMouseLeave={() => setCollapseHover(false)}
          style={{
            marginLeft: headerAccessory ? undefined : 'auto',
            background: collapseHover ? 'var(--bg-tertiary)' : 'transparent',
            border: '1px solid ' + (collapseHover ? 'var(--border)' : 'transparent'),
            borderRadius: 'var(--md-sys-shape-corner-small)', padding: '6px 8px',
            color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 'var(--md-sys-typescale-body-medium-size)',
            display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.1s',
          }}
        >
          <MaterialIcon name="chevron_right" />
        </MaterialButton>
      </div>
      {children}
    </div>
  );
}
