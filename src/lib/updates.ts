/**
 * Update notice for copies loaded unpacked, which the browser never updates.
 * Once a day the background asks GitHub for the latest release, and the popup
 * and settings page announce it when it is newer than the installed version.
 * Nothing is downloaded or installed.
 *
 * The state lives in `storage.local`, one key per field: it belongs to this
 * device, `resetAll()` and `importSettings()` clear only sync storage, and
 * separate keys keep the background and the pages from overwriting each
 * other's writes.
 */

import { browser } from 'wxt/browser';
import { isRecord } from './settings';

export const RELEASES_API = 'https://api.github.com/repos/ShahFaisalGfG/gfgTypeface/releases/latest';
export const UPDATE_ALARM = 'check-updates';
export const CHECK_INTERVAL_MINUTES = 24 * 60;
export const CHECK_INTERVAL_MS = CHECK_INTERVAL_MINUTES * 60_000;
export const FETCH_TIMEOUT_MS = 10_000;

/** A published release and its extension zip. */
export interface Release {
  /** `X.Y.Z`, the tag without its `v`. */
  version: string;
  /** The release page with the release notes (`html_url`). */
  url: string;
  /** The `gfgTypeface_<version>_chrome.zip` asset (`browser_download_url`). */
  download: string;
}

export interface UpdateState {
  /** The "Check for updates once a day" switch. */
  enabled: boolean;
  /** The latest release found, or null before the first successful check. */
  latest: Release | null;
  /** When the last check started, in milliseconds since the epoch; 0 before the first. */
  checkedAt: number;
  /** The version whose notice the user dismissed. */
  dismissed: string | null;
}

/** `storage.local` key of each state field. */
export const UPDATE_KEYS = {
  enabled: 'updates.enabled',
  latest: 'updates.latest',
  checkedAt: 'updates.checkedAt',
  dismissed: 'updates.dismissed',
} as const satisfies Record<keyof UpdateState, string>;

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function parseVersion(version: string): number[] | null {
  const match = VERSION.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

/**
 * Compares `X.Y.Z` versions numerically: below 0 when `a` is older than `b`,
 * 0 when they are equal, above 0 when `a` is newer. Undefined when either is malformed.
 */
export function compareVersions(a: string, b: string): number | undefined {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return undefined;
  const index = left.findIndex((part, i) => part !== right[i]);
  return index === -1 ? 0 : left[index]! - right[index]!;
}

/** Whether `value` is an https link on github.com. Only the host is checked, so links keep working if the repository moves. */
function isGitHubUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const url = URL.parse(value);
  return url?.protocol === 'https:' && url.hostname === 'github.com';
}

/** Reads GitHub's latest-release response. Null unless it has a `vX.Y.Z` tag, a release page and the release zip. */
export function parseRelease(data: unknown): Release | null {
  if (!isRecord(data) || typeof data.tag_name !== 'string' || !isGitHubUrl(data.html_url) || !Array.isArray(data.assets)) return null;
  const version = data.tag_name.startsWith('v') ? data.tag_name.slice(1) : '';
  if (!parseVersion(version)) return null;
  const zip = `gfgTypeface_${version}_chrome.zip`;
  const asset: unknown = data.assets.find((item) => isRecord(item) && item.name === zip);
  if (!isRecord(asset) || !isGitHubUrl(asset.browser_download_url)) return null;
  return { version, url: data.html_url, download: asset.browser_download_url };
}

function readRelease(value: unknown): Release | null {
  if (!isRecord(value) || typeof value.version !== 'string' || !parseVersion(value.version)) return null;
  if (!isGitHubUrl(value.url) || !isGitHubUrl(value.download)) return null;
  return { version: value.version, url: value.url, download: value.download };
}

/** Builds the state from stored items, with defaults for missing or broken values. */
export function readUpdateState(items: Record<string, unknown>): UpdateState {
  const enabled = items[UPDATE_KEYS.enabled];
  const checkedAt = items[UPDATE_KEYS.checkedAt];
  const dismissed = items[UPDATE_KEYS.dismissed];
  return {
    enabled: typeof enabled === 'boolean' ? enabled : true,
    latest: readRelease(items[UPDATE_KEYS.latest]),
    checkedAt: typeof checkedAt === 'number' && Number.isFinite(checkedAt) && checkedAt >= 0 ? checkedAt : 0,
    dismissed: typeof dismissed === 'string' ? dismissed : null,
  };
}

/**
 * Whether a check is due: checks are on and the last one started at least 24
 * hours ago, or in the future after the clock was turned back.
 */
export function isCheckDue(state: UpdateState, now: number): boolean {
  if (!state.enabled) return false;
  const elapsed = now - state.checkedAt;
  return elapsed >= CHECK_INTERVAL_MS || elapsed < 0;
}

/** The release to announce: newer than `installed` and not dismissed, while checks are on. */
export function pendingUpdate(state: UpdateState, installed: string): Release | null {
  const { latest } = state;
  if (!state.enabled || !latest || latest.version === state.dismissed) return null;
  return (compareVersions(latest.version, installed) ?? 0) > 0 ? latest : null;
}

/** Asks GitHub for the latest release in one anonymous request (no cookies, no referrer) that gives up after 10 seconds. */
export async function fetchLatestRelease(): Promise<Release> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('GitHub did not answer within 10 seconds')), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(RELEASES_API, {
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    const release = parseRelease(await response.json());
    if (!release) throw new Error('The latest release has no vX.Y.Z tag or no extension zip');
    return release;
  } finally {
    clearTimeout(timer);
  }
}

/** Whether this copy is loaded unpacked, the only kind of install the browser never updates. */
export async function isUnpacked(): Promise<boolean> {
  return (await browser.management.getSelf()).installType === 'development';
}

/** Reads the update state. */
export async function loadUpdateState(): Promise<UpdateState> {
  return readUpdateState(await browser.storage.local.get(Object.values(UPDATE_KEYS)));
}

/** Saves the given fields and leaves the others as they are. */
export async function saveUpdateState(changes: Partial<UpdateState>): Promise<void> {
  const items: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(changes)) items[UPDATE_KEYS[field as keyof UpdateState]] = value;
  await browser.storage.local.set(items);
}

/** Calls `listener` with the new state whenever a field changes. */
export function watchUpdateState(listener: (state: UpdateState) => void): () => void {
  const keys = new Set<string>(Object.values(UPDATE_KEYS));
  const handler = (changes: Record<string, unknown>, areaName: string) => {
    if (areaName !== 'local' || !Object.keys(changes).some((key) => keys.has(key))) return;
    loadUpdateState().then(listener, (error: unknown) => console.warn('[gfg Typeface] Could not read the update state', error));
  };
  browser.storage.onChanged.addListener(handler);
  return () => browser.storage.onChanged.removeListener(handler);
}

/**
 * Checks GitHub for a newer release when a check is due, on unpacked copies
 * only. The daily alarm is set 24 hours after the last check so it never fires
 * just before the next one is due. The attempt is recorded before the request,
 * so even a failing network sends at most one request a day. Rejects when the
 * request fails.
 */
export async function checkForUpdates(now = Date.now()): Promise<void> {
  if (!(await isUnpacked())) return;
  const state = await loadUpdateState();
  if (!state.enabled) {
    await browser.alarms.clear(UPDATE_ALARM);
    return;
  }
  const due = isCheckDue(state, now);
  const checkedAt = due ? now : state.checkedAt;
  await browser.alarms.create(UPDATE_ALARM, { when: checkedAt + CHECK_INTERVAL_MS, periodInMinutes: CHECK_INTERVAL_MINUTES });
  if (!due) return;
  await saveUpdateState({ checkedAt });
  await saveUpdateState({ latest: await fetchLatestRelease() });
}
