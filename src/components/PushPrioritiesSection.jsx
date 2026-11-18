import { useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/index.js';
import { PUSH_CATEGORIES, PUSH_PRIORITIES } from '../utils/pushPriorities.js';
import { MaterialButton, MaterialSelect } from '../material/controls.jsx';

const CATEGORY_LABELS = {
  primary: 'messageList.categories.primary', newsletter: 'messageList.categories.newsletter',
  promotion: 'messageList.categories.promotion', automated: 'messageList.categories.automated', social: 'messageList.categories.social',
};
const PRIORITY_LABELS = {
  high: 'admin.pushPriorities.high', normal: 'admin.pushPriorities.normal',
  low: 'admin.pushPriorities.low', 'very-low': 'admin.pushPriorities.veryLow',
};

export default function PushPrioritiesSection() {
  const { t } = useTranslation();
  const id = useId();
  const { user, isLocked, pushPriorities, pushPriorityChanges, pushPrioritiesStatus: status,
    loadPushPriorities, savePushPriorities, setPushPriority, categorizationEnabled, setAdminTab } = useStore();
  useEffect(() => { if (!isLocked) loadPushPriorities(); }, [user?.id, isLocked, loadPushPriorities]);
  const loading = status === 'idle' || status === 'loading';
  const saving = status === 'saving';
  const dirty = Object.keys(pushPriorityChanges).length > 0;
  return <section className="material-push-priorities" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>{t('admin.pushPriorities.title')}</h3>
    <p>{t('admin.pushPriorities.description')}</p>
    <p id={`${id}-delivery`}>{t('admin.pushPriorities.deliveryHint')}</p>
    <p>{t('admin.pushPriorities.batchHint')}</p>
    {!categorizationEnabled && <div className="material-push-priorities-notice">
      <p>{t('admin.pushPriorities.categoriesOff')}</p>
      <MaterialButton type="button" variant="text" onClick={() => setAdminTab('categories')}>{t('admin.tabs.categories')}</MaterialButton>
    </div>}
    {loading ? <p role="status">{t('common.loading')}</p> : status === 'load-error' ? <div role="alert">
      <p>{t('admin.pushPriorities.loadError')}</p>
      <MaterialButton type="button" variant="outlined" onClick={loadPushPriorities}>{t('common.retry')}</MaterialButton>
    </div> : <form aria-describedby={`${id}-delivery`} onSubmit={event => { event.preventDefault(); savePushPriorities(); }}>
      <div className="material-push-priority-fields">
        {PUSH_CATEGORIES.map(category => <label className="material-preference-field" key={category}>
          <span>{t(CATEGORY_LABELS[category])}</span>
          <MaterialSelect disabled={saving || isLocked || !user?.id} value={pushPriorityChanges[category] ?? pushPriorities[category]}
            onChange={event => setPushPriority(category, event.target.value)}>
            {PUSH_PRIORITIES.map(priority => <option key={priority} value={priority}>{t(PRIORITY_LABELS[priority])}</option>)}
          </MaterialSelect>
        </label>)}
      </div>
      {status === 'save-error' && <p role="alert">{t('admin.pushPriorities.saveError')}</p>}
      <div className="material-push-priority-actions">
        <MaterialButton type="submit" variant="filled" disabled={!dirty || saving || isLocked || !user?.id}>
          {saving ? t('common.saving') : status === 'save-error' ? t('common.retry') : t('common.save')}
        </MaterialButton>
        {status === 'saved' && <span role="status">{t('admin.pushPriorities.saved')}</span>}
      </div>
    </form>}
  </section>;
}
