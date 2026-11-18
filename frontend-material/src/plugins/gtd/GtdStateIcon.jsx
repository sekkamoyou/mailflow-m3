import { MaterialIcon } from '../../material/controls.jsx';

const ICONS = {
  todo: 'radio_button_unchecked',
  delegated: 'person',
  watch: 'visibility',
  reference: 'bookmark',
  someday: 'schedule',
};

export default function GtdStateIcon({ state, size = 13 }) {
  return <MaterialIcon name={ICONS[state] || ICONS.todo} size={size} />;
}
