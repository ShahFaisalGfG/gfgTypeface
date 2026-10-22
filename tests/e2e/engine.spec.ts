import type { Page } from '@playwright/test';
import { SITE, expect, profile, settle, style, test, width } from './fixtures';

const SCALED = ['#h1s', '#ps', '#pxs', '#ems', '#ems2', '#rems', '#clamps'];

async function widths(page: Page, selectors: string[]): Promise<number[]> {
  return Promise.all(selectors.map((selector) => width(page, selector)));
}

test('text size scales every element relative to its own size without changing computed sizes', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await page.goto('/sizes.html');
  await settle(page);
  const before = await widths(page, SCALED);
  const sizesBefore = await Promise.all(SCALED.map((selector) => style(page, selector, 'font-size')));

  await setSettings({ global: profile({ size: 150 }) });
  await settle(page);

  const after = await widths(page, SCALED);
  after.forEach((value, index) => expect(value / before[index]!).toBeCloseTo(1.5, 1));
  expect(await Promise.all(SCALED.map((selector) => style(page, selector, 'font-size')))).toEqual(sizesBefore);

  // Line heights grow with the text: px, unitless (also inherited by smaller text) and em.
  expect(await style(page, '#lhpx', 'line-height')).toBe('45px');
  expect(await style(page, '#lhnum', 'line-height')).toBe('48px');
  expect(await style(page, '#lhnum-child', 'line-height')).toBe('30px');
  expect(await style(page, '#lhem', 'line-height')).toBe('48px');
  // SVG text keeps its geometry.
  expect(await style(page, '#svgtext', 'font-size-adjust')).toBe('none');
});

test('font replacement keeps icon and code fonts and covers explicit repeats', async ({ context, setSettings }) => {
  await setSettings({ global: profile({ font: 'Georgia' }) });
  const page = await context.newPage();
  await page.goto('/sizes.html');
  await settle(page);

  for (const selector of ['#ps', '#pxs', '#explicit', '#h1s', '#input', '#lhnum-child']) {
    expect(await style(page, selector, 'font-family'), selector).toMatch(/^Georgia,/);
  }
  expect(await style(page, '#code', 'font-family')).toBe('monospace');
  expect(await style(page, '#pua', 'font-family')).toMatch(/^"?Fake Icons/);
  expect(await style(page, '#lig', 'font-family')).toMatch(/^"?Material Icons/);
  // Nothing is written into editable content.
  expect(await page.locator('#editor [data-gfc-f], #editor [data-gfc-w], #editor [data-gfc-ln]').count()).toBe(0);
});

test('code font replaces monospace without changing its size', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await page.goto('/sizes.html');
  await settle(page);
  const before = await width(page, '#code');

  await setSettings({ global: profile({ codeFont: 'Consolas' }) });
  await settle(page);
  expect(await style(page, '#code', 'font-family')).toMatch(/^Consolas,/);
  // Consolas and the default monospace font differ slightly in width; the 13px size must stay.
  expect((await width(page, '#code')) / before).toBeGreaterThan(0.85);
  expect((await width(page, '#code')) / before).toBeLessThan(1.15);
});

test('weight changes are relative and leave icons alone', async ({ context, setSettings }) => {
  await setSettings({ global: profile({ weight: 300 }) });
  const page = await context.newPage();
  await page.goto('/sizes.html');
  await settle(page);
  expect(await style(page, '#p', 'font-weight')).toBe('700');
  expect(await style(page, '#bold', 'font-weight')).toBe('1000');
  expect(await style(page, '#light', 'font-weight')).toBe('600');
  expect(await style(page, '#pua', 'font-weight')).toBe('400');
});

test('shadow roots, late shadow roots, frames and inserted nodes are covered', async ({ context, setSettings }) => {
  await setSettings({ global: profile({ font: 'Georgia' }) });
  const page = await context.newPage();
  await page.goto('/dynamic.html');
  await settle(page);

  const shadowFamily = (code: string) => page.evaluate(code);
  expect(await shadowFamily(`getComputedStyle(document.getElementById('host-open').shadowRoot.getElementById('so')).fontFamily`)).toMatch(/^Georgia,/);
  expect(await shadowFamily(`getComputedStyle(window.closedRoot.getElementById('sc')).fontFamily`)).toMatch(/^Georgia,/);

  await page.evaluate(`window.addLate(); window.addNodes();`);
  await settle(page);
  expect(await shadowFamily(`getComputedStyle(document.getElementById('late').shadowRoot.getElementById('sl')).fontFamily`)).toMatch(/^Georgia,/);
  expect(await style(page, '#dyn', 'font-family')).toMatch(/^Georgia,/);
  expect(await style(page, '#dyn-child', 'font-family')).toMatch(/^Georgia,/);

  const frame = page.frameLocator('#frame');
  await expect.poll(() => frame.locator('#f').evaluate((element) => getComputedStyle(element).fontFamily)).toMatch(/^Georgia,/);
});

test('turning a site off removes every trace', async ({ context, setSettings }) => {
  await setSettings({ global: profile({ font: 'Georgia', size: 120, weight: 100 }) });
  const page = await context.newPage();
  await page.goto('/sizes.html');
  await settle(page);
  expect(await page.locator('[data-gfc-f]').count()).toBeGreaterThan(0);

  await setSettings({ global: profile({ font: 'Georgia', size: 120, weight: 100 }), [`site:${SITE}`]: { enabled: false } });
  await settle(page);
  expect(await page.locator('[data-gfc-f],[data-gfc-ln],[data-gfc-lp],[data-gfc-lnorm],[data-gfc-w],[data-gfc-g]').count()).toBe(0);
  expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
  expect(await style(page, '#ps', 'font-family')).toBe('Arial, sans-serif');
});

test('works on pages whose CSP blocks inline styles', async ({ context, setSettings }) => {
  await setSettings({ global: profile({ font: 'Georgia', size: 130 }) });
  const page = await context.newPage();
  await page.goto('/csp-page.html');
  await settle(page);
  expect(await style(page, '#ps', 'font-family')).toMatch(/^Georgia,/);
  expect(await style(page, '#ps', 'font-size-adjust')).toBe('ic-width 1.3');
});

test('language fonts apply per glyph and language sizes per paragraph', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await page.goto('/lang.html');
  await settle(page);
  const ids = ['#urs', '#ur-en', '#mix-ur', '#mix-en', '#um', '#en'];
  const base = await widths(page, ids);

  const urdu = { family: 'Courier New', faces: [{ local: ['Courier New'], weight: '400', style: 'normal' }], size: 100 };
  await setSettings({ global: profile({ languages: { ur: urdu } }) });
  await settle(page);
  const withFont = await widths(page, ids);
  // Urdu runs switch font; English runs stay the same, even in the same paragraph.
  expect(Math.abs(withFont[2]! - base[2]!)).toBeGreaterThan(5);
  expect(withFont[3]).toBeCloseTo(base[3]!, 0);
  expect(withFont[5]).toBeCloseTo(base[5]!, 0);

  await setSettings({ global: profile({ languages: { ur: { ...urdu, size: 150 } } }) });
  await settle(page);
  const sized = await widths(page, ids);
  // Paragraphs marked or detected as Urdu grow; English paragraphs don't.
  expect(sized[0]! / withFont[0]!).toBeCloseTo(1.5, 1);
  expect(sized[4]! / withFont[4]!).toBeCloseTo(1.5, 1);
  expect(sized[5]).toBeCloseTo(withFont[5]!, 0);
});

test('languages get their own line spacing and weight per paragraph', async ({ context, setSettings }) => {
  const page = await context.newPage();
  await page.goto('/lang.html');
  const urdu = { family: 'Courier New', faces: [{ local: ['Courier New'], weight: '400', style: 'normal' }], size: 100 };
  const heights = () => Promise.all(['#ur', '#unmarked', '#english'].map((selector) => page.locator(selector).evaluate((element) => element.getBoundingClientRect().height)));

  await setSettings({ global: profile({ languages: { ur: urdu } }) });
  await settle(page);
  const base = await heights();

  await setSettings({ global: profile({ languages: { ur: { ...urdu, lineSpacing: 150, weight: 300 } } }) });
  await settle(page);
  const spaced = await heights();
  // Marked and detected Urdu paragraphs get taller lines and bolder text; English doesn't change.
  expect(spaced[0]! / base[0]!).toBeCloseTo(1.5, 1);
  expect(spaced[1]! / base[1]!).toBeCloseTo(1.5, 1);
  expect(spaced[2]).toBeCloseTo(base[2]!, 0);
  expect(await style(page, '#ur', 'font-weight')).toBe('700');
  expect(await style(page, '#english', 'font-weight')).toBe('400');

  // With only the profile's spacing, Urdu lines use the Urdu font's own normal height.
  await setSettings({ global: profile({ lineSpacing: 150, languages: { ur: urdu } }) });
  await settle(page);
  const profileSpaced = await heights();
  expect(profileSpaced[0]! / base[0]!).toBeCloseTo(1.5, 1);
  expect(profileSpaced[2]! / base[2]!).toBeCloseTo(1.5, 1);
});

test('replacement fonts match the x-height of the font they replace', async ({ context, setSettings }) => {
  await setSettings({ global: profile({ font: 'Verdana', matchSize: true }) });
  const page = await context.newPage();
  await page.goto('/sizes.html');
  await settle(page);
  // Georgia (heading) has a smaller x-height than Verdana, so Verdana is drawn smaller there.
  const factor = Number((await style(page, '#h1', 'font-size-adjust')).replace('ic-width ', ''));
  expect(factor).toBeGreaterThan(0.8);
  expect(factor).toBeLessThan(0.95);
});

test('line spacing scales every kind of line height', async ({ context, setSettings }) => {
  await setSettings({ global: profile({ lineSpacing: 150 }) });
  const page = await context.newPage();
  await page.goto('/sizes.html');
  await settle(page);
  expect(await style(page, '#p', 'line-height')).toBe('36px');
  expect(await style(page, '#lhpx', 'line-height')).toBe('45px');
  const normal = Number.parseFloat(await style(page, '#lhnormal', 'line-height'));
  expect(normal).toBeGreaterThan(16 * 1.1 * 1.5);
  expect(normal).toBeLessThan(16 * 1.3 * 1.5);
});

test('class changes and late stylesheets are picked up', async ({ context, setSettings }) => {
  await setSettings({ global: profile({ font: 'Georgia' }) });
  const page = await context.newPage();
  await page.goto('/sizes.html');
  await settle(page);

  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '.late { font-family: "Times New Roman", serif; } #ps { font-family: Tahoma, sans-serif; }';
    document.head.append(style);
    document.getElementById('pxs')!.classList.add('late');
  });
  await settle(page);
  expect(await style(page, '#pxs', 'font-family')).toMatch(/^Georgia,/);
  // Stylesheet changes are verified in coalesced batches, at most every 500 ms.
  await expect.poll(() => style(page, '#ps', 'font-family'), { timeout: 2000 }).toMatch(/^Georgia,/);
});
