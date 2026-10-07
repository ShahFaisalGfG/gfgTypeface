import { type Browser, browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { type SiteCommand, applyCommand, isSiteCommand } from '../lib/commands';
import { type Effective, migrateLegacy, normalizeSite, resolveEffective } from '../lib/settings';
import { normalizeHost, siteKeyFromUrl, siteStorageKey } from '../lib/site';
import { SCHEMA_VERSION, VERSION_KEY, loadSettings, saveSite } from '../lib/storage';

const MENU_TOGGLE = 'toggle-site';
const MENU_OPTIONS = 'open-options';
const LEGACY_KEY = 'settingsByDomain';

const BADGE_COLORS = { site: '#1d4ed8', global: '#4b5563' } as const;

async function effectiveFor(site: string | null): Promise<Effective | null> {
  if (!site) return null;
  const { global, site: siteSettings } = await loadSettings(site);
  return resolveEffective(global, siteSettings);
}

function badgeTitle(site: string | null, effective: Effective | null): string {
  if (!site || !effective) return 'gfg Typeface - not available on this page';
  if (!effective.enabled) return `gfg Typeface - off on ${site}`;
  if (effective.source === 'site') return `gfg Typeface - site settings on ${site}`;
  if (effective.source === 'global') return `gfg Typeface - all-sites defaults on ${site}`;
  return `gfg Typeface - no changes on ${site}`;
}

async function updateTab(tab: Browser.tabs.Tab): Promise<void> {
  if (tab.id === undefined) return;
  const tabId = tab.id;
  const site = siteKeyFromUrl(tab.url);
  try {
    const effective = await effectiveFor(site);
    const source = effective?.source ?? 'none';
    await browser.action.setBadgeText({ tabId, text: source === 'none' ? '' : 'ON' });
    if (source !== 'none') await browser.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLORS[source] });
    await browser.action.setTitle({ tabId, title: badgeTitle(site, effective) });
    if (tab.active) await browser.contextMenus.update(MENU_TOGGLE, { enabled: !!site, checked: !!effective?.enabled });
  } catch {
    // The tab closed, or the menu does not exist yet; the next event updates it.
  }
}

async function updateAllTabs(): Promise<void> {
  const tabs = await browser.tabs.query({});
  await Promise.all(tabs.map(updateTab));
}

/** Runs a site command on the active tab's site. */
async function runCommand(command: SiteCommand): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  const site = siteKeyFromUrl(tab?.url);
  if (!site) return;
  const { global, site: stored } = await loadSettings(site);
  await saveSite(site, applyCommand(command, stored ?? {}, resolveEffective(global, stored)));
}

/** Moves 3.x `settingsByDomain` data into per-site items once. */
async function migrate(): Promise<void> {
  const items = await browser.storage.sync.get([LEGACY_KEY, VERSION_KEY]);
  if (items[LEGACY_KEY] !== undefined) {
    const migrated = Object.entries(migrateLegacy(items[LEGACY_KEY])).map(
      ([host, site]) => [siteStorageKey(normalizeHost(host)), site] as const,
    );
    const existing = await browser.storage.sync.get(migrated.map(([key]) => key));
    const writes: Record<string, unknown> = {};
    // Settings made in this version win over migrated ones.
    for (const [key, site] of migrated) writes[key] = { ...site, ...normalizeSite(existing[key]) };
    if (migrated.length) await browser.storage.sync.set(writes);
    await browser.storage.sync.remove(LEGACY_KEY);
  }
  if (items[VERSION_KEY] !== SCHEMA_VERSION) await browser.storage.sync.set({ [VERSION_KEY]: SCHEMA_VERSION });
}

/** Runs the content scripts in tabs that were open before install or update. */
async function injectIntoOpenTabs(): Promise<void> {
  const scripts = browser.runtime.getManifest().content_scripts ?? [];
  const tabs = await browser.tabs.query({});
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined || !siteKeyFromUrl(tab.url) || tab.discarded) return;
      for (const script of scripts) {
        if (!script.js?.length) continue;
        try {
          await browser.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            files: script.js as never,
            injectImmediately: true,
            world: (script as { world?: 'MAIN' | 'ISOLATED' }).world ?? 'ISOLATED',
          });
        } catch {
          // Restricted pages can't be scripted; other tabs get the scripts on their next load.
        }
      }
    }),
  );
}

function createMenus(): void {
  browser.contextMenus.removeAll(() => {
    browser.contextMenus.create({
      id: MENU_TOGGLE,
      type: 'checkbox',
      title: 'Change fonts on this site',
      contexts: ['action', 'page'],
      checked: true,
    });
    browser.contextMenus.create({ id: MENU_OPTIONS, title: 'All settings', contexts: ['action', 'page'] });
  });
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async () => {
    createMenus();
    try {
      await migrate();
    } catch (error) {
      console.error('[gfg Typeface] Settings migration failed', error);
    }
    await injectIntoOpenTabs();
    await updateAllTabs();
  });

  browser.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === MENU_TOGGLE) void runCommand('toggle-site');
    else if (info.menuItemId === MENU_OPTIONS) void browser.runtime.openOptionsPage();
  });

  browser.commands.onCommand.addListener((command) => {
    if (isSiteCommand(command)) void runCommand(command);
  });

  browser.tabs.onActivated.addListener(({ tabId }) => {
    browser.tabs.get(tabId).then(updateTab, () => undefined);
  });
  browser.tabs.onUpdated.addListener((_tabId, change, tab) => {
    if (change.url !== undefined || change.status === 'loading') void updateTab(tab);
  });
  browser.windows.onFocusChanged.addListener(() => {
    browser.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => tabs.forEach(updateTab), () => undefined);
  });
  browser.storage.onChanged.addListener((_changes, area) => {
    if (area === 'sync') void updateAllTabs();
  });
});
