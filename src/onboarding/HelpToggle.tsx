import { useSyncExternalStore } from 'react';
import { requestPointHelp, subscribePointHelp, pointHelpSnapshot } from './helpMode';

export function HelpToggle() {
  const active = useSyncExternalStore(subscribePointHelp, pointHelpSnapshot);
  return <button className="modal-point-help" type="button" data-help="point-help" data-help-toggle
    aria-label="Что это?" aria-pressed={active} onClick={requestPointHelp}>?</button>;
}
