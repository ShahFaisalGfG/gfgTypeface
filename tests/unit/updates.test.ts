import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  CHECK_INTERVAL_MINUTES,
  CHECK_INTERVAL_MS,
  FETCH_TIMEOUT_MS,
  RELEASES_API,
  UPDATE_ALARM,
  UPDATE_KEYS,
  type UpdateState,
  checkForUpdates,
  compareVersions,
  fetchLatestRelease,
  isCheckDue,
  loadUpdateState,
  parseRelease,
  pendingUpdate,
  readUpdateState,
  saveUpdateState,
  watchUpdateState,
} from '../../src/lib/updates';

const PAGE = 'https://github.com/ShahFaisalGfG/gfgTypeface/releases/tag/v4.2.0';
const ZIP = 'https://github.com/ShahFaisalGfG/gfgTypeface/releases/download/v4.2.0/gfgTypeface_4.2.0_chrome.zip';
const RELEASE = { version: '4.2.0', url: PAGE, download: ZIP };

/** A trimmed GitHub latest-release response. */
function githubRelease(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tag_name: 'v4.2.0',
    html_url: PAGE,
    assets: [
      { name: 'notes.txt', browser_download_url: 'https://github.com/ShahFaisalGfG/gfgTypeface/releases/download/v4.2.0/notes.txt' },
      { name: 'gfgTypeface_4.2.0_chrome.zip', browser_download_url: ZIP },
    ],
    ...overrides,
  };
}

function state(overrides: Partial<UpdateState> = {}): UpdateState {
  return { enabled: true, latest: null, checkedAt: 0, dismissed: null, ...overrides };
}

describe('compareVersions', () => {
  it.each([
    ['4.1.0', '4.0.0', 1],
    ['4.0.0', '4.1.0', -1],
    ['4.10.0', '4.9.9', 1],
    ['10.0.0', '9.99.99', 1],
    ['4.1.2', '4.1.10', -1],
    ['4.1.0', '4.1.0', 0],
  ])('%s against %s', (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b)!)).toBe(sign);
  });

  it.each(['4.1', 'v4.1.0', '4.1.0-beta', '04.1.0', '4.1.0.1', ''])('rejects %j', (version) => {
    expect(compareVersions(version, '4.0.0')).toBeUndefined();
    expect(compareVersions('4.0.0', version)).toBeUndefined();
  });
});

describe('parseRelease', () => {
  it('reads the version, release page and zip', () => {
    expect(parseRelease(githubRelease())).toEqual(RELEASE);
  });

  it.each([
    ['no tag', { tag_name: undefined }],
    ['a tag without v', { tag_name: '4.2.0' }],
    ['a pre-release tag', { tag_name: 'v4.2.0-rc.1' }],
    ['a release page on another host', { html_url: 'https://example.com/releases/v4.2.0' }],
    ['a script URL as the release page', { html_url: 'javascript:alert(1)' }],
    ['no assets', { assets: undefined }],
    ['no zip for the tag', { tag_name: 'v4.3.0' }],
    ['a zip over http', { assets: [{ name: 'gfgTypeface_4.2.0_chrome.zip', browser_download_url: ZIP.replace('https:', 'http:') }] }],
    ['a zip on another host', { assets: [{ name: 'gfgTypeface_4.2.0_chrome.zip', browser_download_url: 'https://example.com/gfgTypeface_4.2.0_chrome.zip' }] }],
  ])('rejects a release with %s', (_case, overrides) => {
    expect(parseRelease(githubRelease(overrides))).toBeNull();
  });

  it.each([null, 'v4.2.0', [], 42])('rejects %j', (data) => {
    expect(parseRelease(data)).toBeNull();
  });
});

describe('readUpdateState', () => {
  it('defaults to checks on and nothing found', () => {
    expect(readUpdateState({})).toEqual(state());
  });

  it('keeps valid values', () => {
    const items = { [UPDATE_KEYS.enabled]: false, [UPDATE_KEYS.latest]: RELEASE, [UPDATE_KEYS.checkedAt]: 5, [UPDATE_KEYS.dismissed]: '4.2.0' };
    expect(readUpdateState(items)).toEqual({ enabled: false, latest: RELEASE, checkedAt: 5, dismissed: '4.2.0' });
  });

  it('drops broken values', () => {
    const items = {
      [UPDATE_KEYS.enabled]: 'no',
      [UPDATE_KEYS.latest]: { ...RELEASE, download: 'https://example.com/x.zip' },
      [UPDATE_KEYS.checkedAt]: Number.NaN,
      [UPDATE_KEYS.dismissed]: 4,
    };
    expect(readUpdateState(items)).toEqual(state());
    expect(readUpdateState({ [UPDATE_KEYS.checkedAt]: -1, [UPDATE_KEYS.latest]: { ...RELEASE, version: 'latest' } })).toEqual(state());
  });
});

describe('isCheckDue', () => {
  const now = 10 * CHECK_INTERVAL_MS;

  it('is due before the first check', () => {
    expect(isCheckDue(state(), now)).toBe(true);
  });

  it('waits 24 hours between checks', () => {
    expect(isCheckDue(state({ checkedAt: now - CHECK_INTERVAL_MS + 1 }), now)).toBe(false);
    expect(isCheckDue(state({ checkedAt: now - CHECK_INTERVAL_MS }), now)).toBe(true);
  });

  it('is due when the last check is in the future after a clock change', () => {
    expect(isCheckDue(state({ checkedAt: now + 60_000 }), now)).toBe(true);
  });

  it('is never due with checks off', () => {
    expect(isCheckDue(state({ enabled: false }), now)).toBe(false);
  });
});

describe('pendingUpdate', () => {
  it('announces a newer release', () => {
    expect(pendingUpdate(state({ latest: RELEASE }), '4.1.0')).toEqual(RELEASE);
  });

  it('stays quiet for the installed version or an older one', () => {
    expect(pendingUpdate(state({ latest: RELEASE }), '4.2.0')).toBeNull();
    expect(pendingUpdate(state({ latest: RELEASE }), '4.10.0')).toBeNull();
  });

  it('stays quiet after a dismissal until a newer version is out', () => {
    expect(pendingUpdate(state({ latest: RELEASE, dismissed: '4.2.0' }), '4.1.0')).toBeNull();
    expect(pendingUpdate(state({ latest: RELEASE, dismissed: '4.1.5' }), '4.1.0')).toEqual(RELEASE);
  });

  it('stays quiet with checks off or an unreadable installed version', () => {
    expect(pendingUpdate(state({ latest: RELEASE, enabled: false }), '4.1.0')).toBeNull();
    expect(pendingUpdate(state({ latest: RELEASE }), '4.1')).toBeNull();
    expect(pendingUpdate(state(), '4.1.0')).toBeNull();
  });
});

describe('fetchLatestRelease', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('makes one anonymous, uncached request and clears its timeout', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValue(Response.json(githubRelease()));
    vi.stubGlobal('fetch', fetch);

    await expect(fetchLatestRelease()).resolves.toEqual(RELEASE);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      RELEASES_API,
      expect.objectContaining({ cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: expect.any(AbortSignal) }),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects error statuses and malformed releases', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limited', { status: 403 })));
    await expect(fetchLatestRelease()).rejects.toThrow('GitHub answered 403');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(githubRelease({ tag_name: 'nightly' }))));
    await expect(fetchLatestRelease()).rejects.toThrow('no vX.Y.Z tag');
  });

  it('gives up after 10 seconds', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined;
        return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(signal?.reason)));
      }),
    );

    const result = expect(fetchLatestRelease()).rejects.toThrow('did not answer within 10 seconds');
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await result;
  });
});

describe('update state storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('saves each field under its own local key', async () => {
    await saveUpdateState({ enabled: false });
    await saveUpdateState({ dismissed: '4.2.0' });
    expect(await fakeBrowser.storage.local.get(null)).toEqual({ [UPDATE_KEYS.enabled]: false, [UPDATE_KEYS.dismissed]: '4.2.0' });
    expect(await fakeBrowser.storage.sync.get(null)).toEqual({});
    expect(await loadUpdateState()).toEqual(state({ enabled: false, dismissed: '4.2.0' }));
  });

  it('reports changes to the update state only', async () => {
    const listener = vi.fn();
    const stop = watchUpdateState(listener);
    await fakeBrowser.storage.sync.set({ global: {} });
    await fakeBrowser.storage.local.set({ unrelated: true });
    await saveUpdateState({ enabled: false });

    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith(state({ enabled: false })));
    expect(listener).toHaveBeenCalledOnce();
    stop();
  });
});

describe('checkForUpdates', () => {
  const now = 100 * CHECK_INTERVAL_MS;
  let fetch: Mock;
  let installType: string;

  beforeEach(() => {
    fakeBrowser.reset();
    installType = 'development';
    // The fake browser does not implement management; only the install type matters here.
    fakeBrowser.management.getSelf = (async () => ({ installType })) as unknown as typeof fakeBrowser.management.getSelf;
    fetch = vi.fn().mockResolvedValue(Response.json(githubRelease()));
    vi.stubGlobal('fetch', fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('checks when due and sets the daily alarm 24 hours later', async () => {
    await checkForUpdates(now);
    expect(fetch).toHaveBeenCalledOnce();
    expect(await loadUpdateState()).toEqual(state({ latest: RELEASE, checkedAt: now }));
    expect(await fakeBrowser.alarms.get(UPDATE_ALARM)).toMatchObject({
      scheduledTime: now + CHECK_INTERVAL_MS,
      periodInMinutes: CHECK_INTERVAL_MINUTES,
    });
  });

  it('waits until a check is due and keeps the alarm on that time', async () => {
    await saveUpdateState({ checkedAt: now - 1000 });
    await checkForUpdates(now);
    expect(fetch).not.toHaveBeenCalled();
    expect(await fakeBrowser.alarms.get(UPDATE_ALARM)).toMatchObject({ scheduledTime: now - 1000 + CHECK_INTERVAL_MS });
  });

  it('counts a failed check, so a failing network makes one request a day', async () => {
    await saveUpdateState({ latest: RELEASE });
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(checkForUpdates(now)).rejects.toThrow('Failed to fetch');
    await checkForUpdates(now + 60_000);
    expect(fetch).toHaveBeenCalledOnce();
    expect(await loadUpdateState()).toEqual(state({ latest: RELEASE, checkedAt: now }));
  });

  it('clears the alarm and sends nothing while checks are off', async () => {
    await fakeBrowser.alarms.create(UPDATE_ALARM, { periodInMinutes: CHECK_INTERVAL_MINUTES });
    await saveUpdateState({ enabled: false });
    await checkForUpdates(now);
    expect(fetch).not.toHaveBeenCalled();
    expect(await fakeBrowser.alarms.get(UPDATE_ALARM)).toBeUndefined();
  });

  it('never checks a copy the browser updates itself', async () => {
    installType = 'normal';
    await checkForUpdates(now);
    expect(fetch).not.toHaveBeenCalled();
    expect(await fakeBrowser.alarms.getAll()).toEqual([]);
    expect(await fakeBrowser.storage.local.get(null)).toEqual({});
  });
});
