import type { Worker } from '@playwright/test';
import { expect, test } from './fixtures';

const RELEASE = {
  version: '9.0.0',
  url: 'https://github.com/ShahFaisalGfG/gfgTypeface/releases/tag/v9.0.0',
  download: 'https://github.com/ShahFaisalGfG/gfgTypeface/releases/download/v9.0.0/gfgTypeface_9.0.0_chrome.zip',
};
const NOTICE_TEXT = 'gfg Typeface 9.0.0 is available.';

/** Replaces the update state in local storage. */
async function setUpdates(worker: Worker, items: Record<string, unknown>): Promise<void> {
  await worker.evaluate(async (values) => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set(values);
  }, items);
}

function localItems(worker: Worker): Promise<Record<string, unknown>> {
  return worker.evaluate(() => chrome.storage.local.get(null));
}

function updateAlarm(worker: Worker): Promise<chrome.alarms.Alarm | undefined> {
  return worker.evaluate(() => chrome.alarms.get('check-updates'));
}

test('an unpacked copy checks on install and copes with GitHub out of reach', async ({ worker }) => {
  expect(await worker.evaluate(async () => (await chrome.management.getSelf()).installType)).toBe('development');
  await expect.poll(() => updateAlarm(worker)).toMatchObject({ periodInMinutes: 1440 });
  await expect.poll(async () => (await localItems(worker))['updates.checkedAt']).toEqual(expect.any(Number));
  // An array path, because the key itself contains a dot.
  expect(await localItems(worker)).not.toHaveProperty(['updates.latest']);
});

test('popup announces a newer release until it is dismissed', async ({ context, worker, extensionId }) => {
  await setUpdates(worker, { 'updates.latest': RELEASE });
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  const notice = popup.locator('.notice', { hasText: NOTICE_TEXT });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('link', { name: 'Download' })).toHaveAttribute('href', RELEASE.download);
  await expect(notice.getByRole('link', { name: "What's new" })).toHaveAttribute('href', RELEASE.url);
  await expect(notice.getByRole('link', { name: 'How to update' })).toHaveAttribute('href', 'https://github.com/ShahFaisalGfG/gfgTypeface#updating');

  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await expect(notice).toHaveCount(0);
  expect(await localItems(worker)).toMatchObject({ 'updates.dismissed': '9.0.0' });

  await popup.reload();
  await expect(popup.locator('#app')).not.toHaveAttribute('aria-busy');
  await expect(notice).toHaveCount(0);
});

test('no notice for the installed version', async ({ context, worker, extensionId }) => {
  const { version } = await worker.evaluate(() => chrome.runtime.getManifest());
  await setUpdates(worker, { 'updates.latest': { ...RELEASE, version } });
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.locator('#app')).not.toHaveAttribute('aria-busy');
  await expect(options.getByText('is available.')).toHaveCount(0);
});

test('settings page turns the daily check off and on', async ({ context, worker, extensionId }) => {
  await setUpdates(worker, { 'updates.latest': RELEASE });
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);

  const notice = options.locator('.notice', { hasText: NOTICE_TEXT });
  const toggle = options.getByRole('switch', { name: 'Check for updates once a day' });
  await expect(notice).toBeVisible();
  await expect(toggle).toBeChecked();

  await toggle.focus();
  await options.keyboard.press('Space');
  await expect(toggle).not.toBeChecked();
  await expect(notice).toHaveCount(0);
  await expect.poll(() => localItems(worker)).toMatchObject({ 'updates.enabled': false });
  await expect.poll(() => updateAlarm(worker)).toBeUndefined();

  await options.getByText('Check for updates once a day', { exact: true }).click();
  await expect(toggle).toBeChecked();
  await expect(notice).toBeVisible();
  await expect.poll(() => updateAlarm(worker)).toMatchObject({ periodInMinutes: 1440 });
});
