/** Messages between extension pages and content scripts. */

import type { GlobalSettings, SiteSettings } from './settings';

/** Port the popup opens to every frame of the active tab for live preview. */
export const PREVIEW_PORT = 'gfc-preview';

/** Draft settings streamed over the preview port while the user edits. */
export interface PreviewMessage {
  type: 'preview';
  global: GlobalSettings;
  site: SiteSettings | undefined;
}
