// Renders assets/icon.svg to the PNG sizes the manifest and stores use.
// Usage: npm run icons
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const SIZES = [16, 32, 48, 128];
const svg = await readFile(new URL('../assets/icon.svg', import.meta.url), 'utf8');
const outDir = new URL('../public/icon/', import.meta.url);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const size of SIZES) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.screenshot({ path: fileURLToPath(new URL(`${size}.png`, outDir)), omitBackground: true });
    console.log(`public/icon/${size}.png`);
  }
} finally {
  await browser.close();
}
