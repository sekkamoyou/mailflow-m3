import { MaterialIcon } from '../material/controls.jsx';
// Shared bits for rendering attachment chips, so every view that shows them — the reading
// pane's AttachmentStrip and the conversation card's (#634) — shows the same icons and sizes.
export function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileIcon(type) {
  const t = (type || '').toLowerCase();
  if (t.startsWith('image/')) return (
    <MaterialIcon name="image" size={18} />
  );
  if (t === 'application/pdf') return (
    <MaterialIcon name="picture_as_pdf" size={18} />
  );
  if (t.includes('word') || t.includes('document')) return (
    <MaterialIcon name="description" size={18} />
  );
  if (t.includes('sheet') || t.includes('excel') || t.includes('csv')) return (
    <MaterialIcon name="table_chart" size={18} />
  );
  if (t.includes('zip') || t.includes('compressed') || t.includes('archive')) return (
    <MaterialIcon name="deployed_code" size={18} />
  );
  if (t.startsWith('video/')) return (
    <MaterialIcon name="videocam" size={18} />
  );
  if (t.startsWith('audio/')) return (
    <MaterialIcon name="music_note" size={18} />
  );
  return (
    <MaterialIcon name="attach_file" size={18} />
  );
}
