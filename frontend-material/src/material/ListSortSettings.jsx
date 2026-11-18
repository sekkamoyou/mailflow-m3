import { useTranslation } from 'react-i18next';
import { useStore } from '../store/index.js';
import { DEFAULT_LIST_ORDER, LIST_SORTS, isDefaultListOrder, listOrderFor, pickListSort } from '../utils/listSort.js';
import { MaterialButton, MaterialSelect } from './controls.jsx';

const SORT_LABELS = { date: 'messageList.sortDate', from: 'messageList.sortSender', subject: 'messageList.sortSubject' };
const directionKey = (sort, dir) => sort === 'date'
  ? dir === 'asc' ? 'messageList.sortOldestFirst' : 'messageList.sortNewestFirst'
  : dir === 'asc' ? 'messageList.sortAToZ' : 'messageList.sortZToA';

export function listOrderLabel(order, t) {
  const parts = [];
  if (order.sort !== 'date' || order.dir !== 'desc') {
    parts.push(t('messageList.sortSummary', { sort: t(SORT_LABELS[order.sort]), dir: t(directionKey(order.sort, order.dir)) }));
  }
  if (order.starredFirst) parts.push(t('messageList.starredOnTop'));
  return parts.join(' · ');
}

export default function ListSortSettings({ accountId, folder }) {
  const { t } = useTranslation();
  const listSort = useStore(s => s.listSort);
  const setListOrder = useStore(s => s.setListOrder);
  const order = listOrderFor(listSort, accountId, folder);
  const choose = next => setListOrder(accountId, folder, next);
  return <fieldset className="material-sort-settings">
    <legend>{t('messageList.sort')}</legend>
    <label className="material-preference-field"><span>{t('messageList.sortBy')}</span>
      <MaterialSelect aria-label={t('messageList.sortBy')} value={order.sort} onChange={event => choose(pickListSort(order, event.target.value))}>
        {LIST_SORTS.map(sort => <option key={sort} value={sort}>{t(SORT_LABELS[sort])}</option>)}
      </MaterialSelect>
    </label>
    <label className="material-preference-field"><span>{t('messageList.sortDirection')}</span>
      <MaterialSelect aria-label={t('messageList.sortDirection')} value={order.dir} onChange={event => choose({ ...order, dir: event.target.value })}>
        {['desc', 'asc'].map(dir => <option key={dir} value={dir}>{t(directionKey(order.sort, dir))}</option>)}
      </MaterialSelect>
    </label>
    <div className="material-preference-row"><span>{t('messageList.starredOnTop')}</span>
      <MaterialButton type="button" variant="switch" role="switch" aria-label={t('messageList.starredOnTop')} aria-checked={order.starredFirst}
        onClick={() => choose({ ...order, starredFirst: !order.starredFirst })} />
    </div>
    <MaterialButton type="button" variant="text" disabled={isDefaultListOrder(order)} onClick={() => choose(DEFAULT_LIST_ORDER)}>{t('messageList.sortReset')}</MaterialButton>
  </fieldset>;
}
