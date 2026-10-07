/**
 * Settings persistence in `storage.sync`, one item per site so each stays far
 * below the 8 KB item quota and settings follow the user across devices.
 */

import { browser } from 'wxt/browser';
import { type GlobalSettings, type SiteSettings, isEmptySite, normalizeGlobal, normalizeSite } from './settings';
import { normalizeHost, siteFromStorageKey, siteStorageKey } from './site';

export const GLOBAL_KEY = 'global';
export const VERSION_KEY = 'version';
export const SCHEMA_VERSION = 4;

/** Raised when browser sync storage is full. */
export class StorageQuotaError extends Error {
  constructor(cause: unknown) {
    super('Browser sync storage is full. Remove settings for sites you no longer need.', { cause });
    this.name = 'StorageQuotaError';
  }
}

const area = () => browser.storage.sync;

async function write(items: Record<string, unknown>): Promise<void> {
  try {
    await area().set(items);
  } catch (error) {
    if (error instanceof Error && /QUOTA/i.test(error.message)) throw new StorageQuotaError(error);
    throw error;
  }
}

export interface LoadedSettings {
  global: GlobalSettings;
  site: SiteSettings | undefined;
}

/** Reads the all-sites defaults and, when `site` is given, its overrides in one call. */
export async function loadSettings(site: string | null): Promise<LoadedSettings> {
  const keys = site ? [GLOBAL_KEY, siteStorageKey(site)] : [GLOBAL_KEY];
  const items = await area().get(keys);
  const stored = site ? items[siteStorageKey(site)] : undefined;
  return {
    global: normalizeGlobal(items[GLOBAL_KEY]),
    site: stored === undefined ? undefined : normalizeSite(stored),
  };
}

/** Saves the all-sites defaults. */
export async function saveGlobal(global: GlobalSettings): Promise<void> {
  await write({ [GLOBAL_KEY]: global });
}

/** Saves a site's overrides, deleting the item when nothing is left. */
export async function saveSite(site: string, settings: SiteSettings): Promise<void> {
  if (isEmptySite(settings)) await area().remove(siteStorageKey(site));
  else await write({ [siteStorageKey(site)]: settings });
}

/** Deletes a site's overrides. */
export async function removeSite(site: string): Promise<void> {
  await area().remove(siteStorageKey(site));
}

/** Reads every stored site, sorted by site key. */
export async function loadAllSites(): Promise<Map<string, SiteSettings>> {
  const items = await area().get(null);
  const sites = new Map<string, SiteSettings>();
  for (const key of Object.keys(items).sort()) {
    const site = siteFromStorageKey(key);
    if (site) sites.set(site, normalizeSite(items[key]));
  }
  return sites;
}

export interface SettingsExport {
  app: 'gfg-typeface';
  version: number;
  global: GlobalSettings;
  sites: Record<string, SiteSettings>;
}

/** Builds a JSON-serializable snapshot of all settings. */
export async function exportSettings(): Promise<SettingsExport> {
  const items = await area().get(null);
  const sites: Record<string, SiteSettings> = {};
  for (const [key, value] of Object.entries(items)) {
    const site = siteFromStorageKey(key);
    if (site) sites[site] = normalizeSite(value);
  }
  return { app: 'gfg-typeface', version: SCHEMA_VERSION, global: normalizeGlobal(items[GLOBAL_KEY]), sites };
}

/** Replaces all settings with a validated import. Returns the number of sites imported. */
export async function importSettings(data: unknown): Promise<number> {
  if (typeof data !== 'object' || data === null || (data as { app?: unknown }).app !== 'gfg-typeface') {
    throw new Error('This file is not a gfg Typeface settings export.');
  }
  const source = data as Partial<SettingsExport>;
  const items: Record<string, unknown> = { [GLOBAL_KEY]: normalizeGlobal(source.global), [VERSION_KEY]: SCHEMA_VERSION };
  const rawSites = typeof source.sites === 'object' && source.sites !== null ? source.sites : {};
  for (const [host, value] of Object.entries(rawSites)) {
    const site = normalizeHost(host);
    const settings = normalizeSite(value);
    if (site && !isEmptySite(settings)) items[siteStorageKey(site)] = settings;
  }
  await area().clear();
  await write(items);
  return Object.keys(items).length - 2;
}

/** Deletes every setting and restores defaults. */
export async function resetAll(): Promise<void> {
  await area().clear();
  await write({ [VERSION_KEY]: SCHEMA_VERSION });
}

/** Calls `listener` with the changed keys whenever sync settings change. */
export function watchSettings(listener: (keys: string[]) => void): () => void {
  const handler = (changes: Record<string, unknown>, areaName: string) => {
    if (areaName === 'sync') listener(Object.keys(changes));
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}
