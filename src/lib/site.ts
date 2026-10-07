/** Site keys: settings are stored per host, with a leading `www.` ignored. */

const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

/** Pages where browsers never run extension content scripts. */
const BLOCKED_HOSTS = new Set(['chromewebstore.google.com', 'chrome.google.com', 'microsoftedge.microsoft.com']);

/** Normalizes a host name into a site key, e.g. `WWW.Example.com` -> `example.com`. */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}

/** Returns the site key for a page URL, or `null` when the extension can't run there. */
export function siteKeyFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) return null;
  if (parsed.protocol === 'file:') return 'file';
  if (!parsed.hostname || BLOCKED_HOSTS.has(parsed.hostname)) return null;
  return normalizeHost(parsed.host);
}

/** Storage key holding a site's overrides. */
export function siteStorageKey(site: string): string {
  return `site:${site}`;
}

/** Extracts the site from a storage key, or `null` for other keys. */
export function siteFromStorageKey(key: string): string | null {
  return key.startsWith('site:') ? key.slice(5) : null;
}
