/// <reference types="chrome" />
import { resolve } from 'node:path';
import { type BrowserContext, type Page, type Worker, test as base, chromium, expect } from '@playwright/test';

const EXTENSION_PATH = resolve('.output/chrome-mv3');

interface Fixtures {
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  /** Replaces all sync settings, e.g. `{ global: {...}, 'site:localhost:4789': {...} }`. */
  setSettings: (items: Record<string, unknown>) => Promise<void>;
}

export const test = base.extend<Fixtures>({
  // Branded Chrome ignores --load-extension, so tests use Playwright's bundled Chromium.
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures must destructure their dependencies.
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });
    await use(context);
    await context.close();
  },
  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },
  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
  setSettings: async ({ worker }, use) => {
    await use(async (items) => {
      await worker.evaluate(async (values) => {
        await chrome.storage.sync.clear();
        await chrome.storage.sync.set(values);
      }, items);
    });
  },
});

export { expect };

export const SITE = 'localhost:4789';

/** Waits until the engine has processed the page (two frames after settings land). */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())), 150);
      }),
  );
}

/** Rendered width of an element's content box. */
export function width(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((element) => element.getBoundingClientRect().width);
}

/** A computed style property of an element. */
export function style(page: Page, selector: string, property: string): Promise<string> {
  return page.locator(selector).evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
}

export function profile(overrides: Record<string, unknown>): Record<string, unknown> {
  return { font: null, matchSize: false, size: 100, lineSpacing: 100, weight: 0, codeFont: null, languages: {}, enabled: true, ...overrides };
}
