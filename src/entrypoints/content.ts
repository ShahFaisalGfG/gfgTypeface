import { type Browser, browser } from 'wxt/browser';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { Engine } from '../engine/engine';
import { PREVIEW_PORT, type PreviewMessage } from '../lib/messages';
import { type GlobalSettings, type SiteSettings, isActiveProfile, resolveEffective } from '../lib/settings';
import { siteKeyFromUrl, siteStorageKey } from '../lib/site';
import { GLOBAL_KEY, loadSettings, watchSettings } from '../lib/storage';

const PREVIEW_SETTLE_MS = 300;

/** The URL of the tab's top-level page, so embedded frames follow the tab's site settings. */
function topLevelUrl(): string {
  if (window === window.top) return location.href;
  const origins = location.ancestorOrigins;
  return origins?.length ? origins[origins.length - 1]! : location.href;
}

/** The engine relies on `font-size-adjust: ic-width` and typed `attr()` (Chrome 133+). */
function supported(): boolean {
  return CSS.supports('font-size-adjust', 'ic-width 1') && CSS.supports('width', 'attr(data-x type(<length>), 0px)');
}

function run(ctx: ContentScriptContext): void {
  const site = siteKeyFromUrl(topLevelUrl());
  if (!site || !supported()) return;

  const engine = new Engine();
  let previewing = false;
  let generation = 0;

  const apply = (global: GlobalSettings, siteSettings: SiteSettings | undefined) => {
    const effective = resolveEffective(global, siteSettings);
    engine.update(effective.enabled && isActiveProfile(effective.profile) ? effective.profile : null);
  };

  const refresh = async () => {
    const current = ++generation;
    try {
      const settings = await loadSettings(site);
      // Ignore stale reads and reads that finish while the popup streams a preview.
      if (current === generation && !previewing && !ctx.isInvalid) apply(settings.global, settings.site);
    } catch (error) {
      console.warn('[gfg Typeface] Could not read settings', error);
    }
  };

  const unwatch = watchSettings((keys) => {
    if (keys.includes(GLOBAL_KEY) || keys.includes(siteStorageKey(site))) void refresh();
  });

  const onConnect = (port: Browser.runtime.Port) => {
    if (port.name !== PREVIEW_PORT) return;
    previewing = true;
    port.onMessage.addListener((message: PreviewMessage) => {
      if (message?.type === 'preview') {
        generation++;
        apply(message.global, message.site);
      }
    });
    port.onDisconnect.addListener(() => {
      // The popup saves its last edit as it closes; give that write time to land.
      setTimeout(() => {
        previewing = false;
        void refresh();
      }, PREVIEW_SETTLE_MS);
    });
  };
  browser.runtime.onConnect.addListener(onConnect);

  // Pages restored from the back/forward cache missed storage events.
  ctx.addEventListener(window, 'pageshow', (event) => {
    if (event.persisted) void refresh();
  });

  ctx.onInvalidated(() => {
    unwatch();
    browser.runtime.onConnect.removeListener(onConnect);
    engine.destroy();
  });

  void refresh();
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,
  matchAboutBlank: true,
  matchOriginAsFallback: true,
  noScriptStartedPostMessage: true,
  main: run,
});
