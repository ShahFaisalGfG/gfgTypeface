/** The "update available" notice shared by the popup and the settings page. */

import { browser } from 'wxt/browser';
import { type UpdateState, pendingUpdate, saveUpdateState } from '../lib/updates';
import { externalLink, h, icon } from './dom';

/**
 * Builds the notice for a release newer than the installed version, or returns
 * null when there is none to announce. Dismiss hides it until the next version;
 * `onError` receives a failed save.
 */
export function updateNotice(state: UpdateState, onError: (error: unknown) => void): HTMLElement | null {
  const { version, homepage_url: homepage } = browser.runtime.getManifest();
  const release = pendingUpdate(state, version);
  if (!release) return null;
  const dismiss = h('button', {
    text: 'Dismiss',
    title: `Hide this notice until a version newer than ${release.version} is out`,
    attrs: { type: 'button' },
    on: { click: () => void saveUpdateState({ dismissed: release.version }).catch(onError) },
  });
  return h(
    'div',
    { class: 'notice notice-accent' },
    icon('download'),
    h(
      'div',
      {},
      h('div', { text: `gfg Typeface ${release.version} is available.` }),
      h(
        'div',
        { class: 'notice-actions' },
        externalLink('Download', release.download, `Download gfgTypeface_${release.version}_chrome.zip from GitHub`),
        externalLink("What's new", release.url, `Release notes for ${release.version} on GitHub`),
        homepage ? externalLink('How to update', `${homepage}#updating`, 'Steps to update a copy loaded unpacked') : null,
        dismiss,
      ),
    ),
  );
}
