import { useTranslation } from 'react-i18next';
import { useStore } from '../store/index.js';
import { folderDisplayName, folderParentLabel, folderRole, folderDelimiter } from '../utils/folderDisplay.js';

const EMPTY_FOLDERS = [];

export default function MessageClassification({ message, compact = false }) {
  const { t } = useTranslation();
  const folders = useStore(state => state.folders[message.account_id] || EMPTY_FOLDERS);
  const mappings = useStore(state => state.accounts.find(a => a.id === message.account_id)?.folder_mappings);
  const paths = [...new Set(message.folder_paths || [message.folder])].filter(Boolean);
  const labels = paths.filter(path => !compact || path !== message.folder).map(path => {
    const found = folders.find(f => f.path === path);
    const delimiter = folderDelimiter(found || folders.find(f => f.delimiter));
    const folder = { ...found, path, delimiter, name: found?.name && found.name !== path ? found.name : path.split(delimiter).pop() };
    const role = folderRole(folder, mappings);
    // All Mail contains Inbox copies too; it does not mean those copies are archived.
    if (String(folder.special_use || '').toLowerCase() === '\\all' && paths.length > 1) return null;
    const parent = role ? '' : folderParentLabel(folder);
    const name = folderDisplayName(folder, t, mappings, folders);
    return { key: path, short: name, text: [parent, name].filter(Boolean).join(' / ') };
  }).filter(Boolean);
  const hasCategory = ['primary', 'newsletter', 'promotion', 'automated', 'social'].includes(message.category);
  if (hasCategory) {
    const category = { key: 'category:' + message.category, text: t(`messageList.categories.${message.category}`) };
    if (compact) labels.unshift(category);
    else labels.push(category);
  }
  if (!labels.length) return null;
  const shown = compact ? labels.slice(0, hasCategory && labels.length > 2 ? 1 : 2) : labels;
  return <span className={`md-message-labels${compact ? ' md-message-labels-compact' : ''}${compact && hasCategory ? ' md-message-labels-categorized' : ''}`}>
    {shown.map(label => <span key={label.key} className="md-message-label" title={label.text}>{compact ? label.short || label.text : label.text}</span>)}
    {compact && labels.length > shown.length && <span className="md-message-label md-message-label-overflow" title={labels.slice(shown.length).map(l => l.text).join(', ')}>+{labels.length - shown.length}</span>}
  </span>;
}
