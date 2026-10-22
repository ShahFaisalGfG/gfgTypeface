/** Keyboard shortcut and context menu actions on a site's settings. */

import { type Effective, LIMITS, type SiteSettings, clampStep } from './settings';

export type SiteCommand = 'toggle-site' | 'size-up' | 'size-down' | 'size-reset';

export const SIZE_STEP = 10;

export function isSiteCommand(value: string): value is SiteCommand {
  return value === 'toggle-site' || value === 'size-up' || value === 'size-down' || value === 'size-reset';
}

/** Returns the site settings after running `command` on them. */
export function applyCommand(command: SiteCommand, site: SiteSettings, effective: Effective): SiteSettings {
  const next: SiteSettings = { ...site };
  switch (command) {
    case 'toggle-site':
      if (effective.enabled) next.enabled = false;
      else delete next.enabled;
      break;
    case 'size-up':
    case 'size-down': {
      const step = command === 'size-up' ? SIZE_STEP : -SIZE_STEP;
      next.size = clampStep(effective.profile.size + step, LIMITS.size, 100);
      // Changing the size implies the user wants changes on this site.
      delete next.enabled;
      break;
    }
    case 'size-reset':
      delete next.size;
      break;
  }
  return next;
}
