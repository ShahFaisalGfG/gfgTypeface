// Renders Chrome Web Store screenshots (1280x800) and the promo tile (440x280) into store/assets/
// from the built extension and a demo page. Usage: npm run store-assets
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import '../tests/e2e/server.mjs';

const root = new URL('../', import.meta.url);
const out = new URL('store/assets/', root);
const extension = fileURLToPath(new URL('.output/chrome-mv3', root));
await mkdir(out, { recursive: true });
const path = (name) => fileURLToPath(new URL(name, out));
const dataUrl = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`;

const settings = {
  global: {
    font: 'Segoe UI',
    matchSize: true,
    size: 115,
    lineSpacing: 110,
    weight: 0,
    codeFont: 'Cascadia Code',
    enabled: true,
    languages: { ur: { family: 'Segoe UI', faces: [{ local: ['Segoe UI'], weight: '400', style: 'normal' }, { local: ['Segoe UI Bold'], weight: '700', style: 'normal' }], size: 130 } },
  },
  'site:localhost:4789': { size: 120 },
  'site:github.com': { codeFont: 'Cascadia Code' },
  'site:x.com': { size: 110 },
};

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(worker.url()).host;

  const page = await context.newPage();
  await page.setViewportSize({ width: 860, height: 520 });
  await page.goto('http://localhost:4789/demo.html');
  await page.waitForTimeout(300);
  const before = await page.screenshot();
  await worker.evaluate((items) => chrome.storage.sync.set(items), settings);
  await page.waitForTimeout(800);
  const after = await page.screenshot();
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:4789/*' }))[0].id);

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 368, height: 200 });
  await popup.goto(`chrome-extension://${id}/popup.html?tabId=${tabId}`);
  await popup.waitForTimeout(400);
  const popupShot = await popup.screenshot({ fullPage: true });
  await popup.getByText('More options').click();
  await popup.waitForTimeout(200);
  const popupMore = await popup.screenshot({ fullPage: true });

  const options = await context.newPage();
  await options.setViewportSize({ width: 1280, height: 800 });
  await options.goto(`chrome-extension://${id}/options.html`);
  await options.waitForTimeout(400);
  await options.screenshot({ path: path('screenshot-3-options.png') });

  const canvas = await context.newPage();
  await canvas.setViewportSize({ width: 1280, height: 800 });
  const frame = (body) => `<!doctype html><html><body style="margin:0;width:1280px;height:800px;overflow:hidden;
    background:linear-gradient(135deg,#eef0ff,#f7f4ff 55%,#fff7e6);font-family:'Segoe UI Variable Display','Segoe UI',sans-serif">${body}</body></html>`;
  const shot = (src, style) => `<img src="${dataUrl(src)}" style="border-radius:14px;box-shadow:0 18px 50px rgb(30 27 75/.22);${style}">`;
  const caption = (title, text) => `<div style="position:absolute;left:56px;top:48px;width:320px">
    <div style="font-size:34px;font-weight:700;line-height:1.15;color:#1e1b4b">${title}</div>
    <div style="margin-top:14px;font-size:17px;line-height:1.5;color:#4b4f63">${text}</div></div>`;

  await canvas.setContent(
    frame(
      caption('Your font, your size, every site', 'Pick a font and a text size per site or for all sites. Sizes stay relative to each site, so layouts never break.') +
        shot(after, 'position:absolute;left:400px;top:48px;width:540px') +
        shot(popupShot, 'position:absolute;left:900px;top:90px;width:330px'),
    ),
  );
  await canvas.waitForTimeout(200);
  await canvas.screenshot({ path: path('screenshot-1-popup.png') });

  await canvas.setContent(
    frame(
      caption('Before and after', 'Larger, calmer text in the font you like, with Urdu set in its own font right inside English paragraphs.').replace('width:320px', 'width:760px') +
        shot(before, 'position:absolute;left:56px;top:200px;width:570px') +
        shot(after, 'position:absolute;left:654px;top:200px;width:570px'),
    ),
  );
  await canvas.waitForTimeout(200);
  await canvas.screenshot({ path: path('screenshot-2-before-after.png') });

  await canvas.setContent(
    frame(
      caption('Fine-tune everything', 'Line spacing, weight, a code font and a font and size for each language, with a live preview as you drag.') +
        shot(popupMore, 'position:absolute;left:520px;top:40px;height:720px'),
    ),
  );
  await canvas.waitForTimeout(200);
  await canvas.screenshot({ path: path('screenshot-4-more-options.png') });

  const icon = await readFile(new URL('public/icon/128.png', root));
  await canvas.setViewportSize({ width: 440, height: 280 });
  await canvas.setContent(`<!doctype html><html><body style="margin:0;width:440px;height:280px;display:grid;place-items:center;
    background:linear-gradient(135deg,#4f46e5,#3420a8);font-family:'Segoe UI Variable Display','Segoe UI',sans-serif;color:#fff">
    <div style="text-align:center"><img src="${dataUrl(icon)}" width="88" height="88">
    <div style="margin-top:10px;font-size:30px;font-weight:700">gfg Typeface</div>
    <div style="margin-top:4px;font-size:15px;opacity:.9">Per-site fonts, text size and language fonts</div></div></body></html>`);
  await canvas.waitForTimeout(200);
  await canvas.screenshot({ path: path('promo-small-440x280.png') });
  console.log(`Store assets written to ${fileURLToPath(out)}`);
} finally {
  await context.close();
  process.exit(0);
}
