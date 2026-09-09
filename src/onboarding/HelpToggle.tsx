import { t as msg, useLocale } from '../i18n';
import { useSyncExternalStore } from 'react';
import { requestPointHelp, subscribePointHelp, pointHelpSnapshot } from './helpMode';

export function HelpToggle() {
  useLocale();
  const active = useSyncExternalStore(subscribePointHelp, pointHelpSnapshot);
  return <button className="modal-point-help" type="button" data-help="point-help" data-help-toggle
    aria-label={msg("helpToggle.whatSThis")} aria-pressed={active} onClick={requestPointHelp}>?</button>;
}
