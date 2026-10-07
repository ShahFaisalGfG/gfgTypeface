import type { Worker } from '@playwright/test';
import { SITE, expect, profile, settle, style, test } from './fixtures';

async function tabIdFor(worker: Worker, path: string): Promise<number> {
  return worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]!.id!, `http://localhost:4789${path}`);
}

test('popup previews live and saves per site', async ({ context, worker, extensionId, setSettings }) => {
  await setSettings({});
  const page = await context.newPage();
  await page.goto('/sizes.html');
  const tabId = await tabIdFor(worker, '/sizes.html');

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
  await expect(popup.getByText(SITE)).toBeVisible();
  await popup.getByRole('button', { name: 'Increase text size' }).click();
  await popup.getByRole('button', { name: 'Increase text size' }).click();

  await settle(page);
  expect(await style(page, '#h1', 'font-size-adjust')).toBe('ic-width 1.1');
  await expect
    .poll(() => worker.evaluate((key) => chrome.storage.sync.get(key), `site:${SITE}`))
    .toEqual({ [`site:${SITE}`]: { size: 110 } });
  await expect.poll(() => worker.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId)).toBe('ON');

  // Font picker: search and choose with the keyboard.
  await popup.getByRole('button', { name: 'Font', exact: true }).click();
  await popup.getByRole('combobox', { name: /Search fonts/ }).fill('Georgia');
  await popup.keyboard.press('Enter');
  await settle(page);
  expect(await style(page, '#ps', 'font-family')).toMatch(/^Georgia,/);

  // The all-sites scope edits defaults without touching the site's overrides.
  await popup.getByRole('button', { name: 'All sites' }).click();
  await popup.getByText('More options').click();
  await popup.getByRole('button', { name: 'Increase line spacing' }).click();
  await expect
    .poll(() => worker.evaluate(() => chrome.storage.sync.get('global')))
    .toMatchObject({ global: { lineSpacing: 105 } });

  // Reset removes the site's own settings.
  await popup.getByRole('button', { name: 'This site' }).click();
  await popup.getByRole('button', { name: 'Reset this site' }).click();
  await expect.poll(() => worker.evaluate((key) => chrome.storage.sync.get(key), `site:${SITE}`)).toEqual({});
});

test('popup explains pages the extension cannot change', async ({ context, worker, extensionId }) => {
  const page = await context.newPage();
  await page.goto('chrome://version');
  // Extensions can't read chrome:// URLs, so find the tab as the active one.
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]!.id!);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
  await expect(popup.getByText('Browsers do not let extensions change this page.', { exact: false })).toBeVisible();
  await expect(popup.getByRole('button', { name: 'This site' })).toBeDisabled();
});

test('options page lists, edits, removes and imports sites', async ({ context, worker, extensionId, setSettings }) => {
  await setSettings({ global: profile({}), 'site:example.com': { size: 120 }, 'site:news.test': { enabled: false } });
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);

  const nav = options.getByRole('navigation', { name: 'Sites' });
  await expect(nav.getByRole('button', { name: 'example.com' })).toBeVisible();
  await expect(nav.getByRole('button', { name: /news\.test/ })).toContainText('Off');

  await nav.getByRole('button', { name: 'example.com' }).click();
  await expect(options.getByRole('heading', { name: 'example.com' })).toBeVisible();
  await options.getByRole('button', { name: 'Increase text size' }).click();
  await expect
    .poll(() => worker.evaluate(() => chrome.storage.sync.get('site:example.com')))
    .toEqual({ 'site:example.com': { size: 125 } });

  await options.getByRole('button', { name: 'Remove site' }).click();
  await options.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(nav.getByRole('button', { name: 'example.com' })).toHaveCount(0);

  const exported = {
    app: 'gfg-typeface',
    version: 4,
    global: profile({ font: 'Georgia' }),
    sites: { 'WWW.Imported.dev': { size: 140 } },
  };
  await options.getByRole('button', { name: 'Import' }).click();
  const chooser = options.waitForEvent('filechooser');
  await options.getByRole('dialog').getByRole('button', { name: 'Choose file' }).click();
  await (await chooser).setFiles({ name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await expect(options.getByText('Imported the all-sites defaults and 1 site.')).toBeVisible();
  await expect(nav.getByRole('button', { name: 'imported.dev' })).toBeVisible();
});
