import { MaterialIcon } from '../material/controls.jsx';
export default function FolderIcon({ specialUse, size = 13 }) {
  const s = (specialUse || '').toLowerCase();
  if (s.includes('sent'))
    return <MaterialIcon name="send" size={size} />;
  if (s.includes('trash'))
    return <MaterialIcon name="delete" size={size} />;
  if (s.includes('draft'))
    return <MaterialIcon name="edit" size={size} />;
  if (s.includes('spam') || s.includes('junk'))
    return <MaterialIcon name="shield" size={size} />;
  return <MaterialIcon name="folder" size={size} />;
}
