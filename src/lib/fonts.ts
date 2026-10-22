/**
 * Installed-font helpers for extension pages: the font list for pickers and a
 * resolver that finds `local()` face names, which `@font-face` needs for
 * language fonts (Chrome matches `local()` against face names, not families).
 */

import { browser } from 'wxt/browser';
import type { LocalFace } from './settings';

export interface InstalledFont {
  family: string;
  label: string;
}

let fontList: Promise<InstalledFont[]> | undefined;

/** Lists installed font families, sorted by name. Cached per page. */
export function getInstalledFonts(): Promise<InstalledFont[]> {
  fontList ??= browser.fontSettings.getFontList().then((fonts) =>
    fonts
      .map((font) => ({ family: font.fontId, label: font.displayName || font.fontId }))
      .filter((font) => font.family)
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
  );
  return fontList;
}

/** Quotes a family name for use in CSS. */
export function cssFamily(family: string): string {
  return `"${family.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r]/g, ' ')}"`;
}

const FACE_VARIANTS: readonly { weight: string; style: LocalFace['style']; suffixes: string[] }[] = [
  { weight: '400', style: 'normal', suffixes: ['', ' Regular', '-Regular'] },
  { weight: '700', style: 'normal', suffixes: [' Bold', '-Bold'] },
  { weight: '400', style: 'italic', suffixes: [' Italic', '-Italic'] },
  { weight: '700', style: 'italic', suffixes: [' Bold Italic', '-BoldItalic'] },
];

async function loads(name: string): Promise<boolean> {
  try {
    await new FontFace(`gfc-probe-${crypto.randomUUID()}`, `local(${cssFamily(name)})`).load();
    return true;
  } catch {
    return false;
  }
}

/**
 * Finds `local()` names for the regular, bold, italic and bold italic faces of
 * `family` by trying common full-name and PostScript-name patterns.
 */
export async function probeFaces(family: string): Promise<LocalFace[]> {
  const compact = family.replace(/\s+/g, '');
  const faces: LocalFace[] = [];
  for (const variant of FACE_VARIANTS) {
    const names = [
      ...new Set(variant.suffixes.flatMap((suffix) => [`${family}${suffix}`, `${compact}${suffix.replace(/\s+/g, '')}`])),
    ];
    const results = await Promise.all(names.map(loads));
    const local = names.filter((_, index) => results[index]);
    if (local.length) faces.push({ local, weight: variant.weight, style: variant.style });
  }
  return faces;
}

interface LocalFontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
}

declare global {
  interface Window {
    queryLocalFonts?: (options?: { postscriptNames?: string[] }) => Promise<LocalFontData[]>;
  }
}

const WEIGHT_WORDS: readonly [RegExp, number][] = [
  [/thin|hairline/i, 100],
  [/extra ?light|ultra ?light/i, 200],
  [/semi ?light|demi ?light/i, 350],
  [/light/i, 300],
  [/medium/i, 500],
  [/semi ?bold|demi ?bold/i, 600],
  [/extra ?bold|ultra ?bold/i, 800],
  [/black|heavy/i, 900],
  [/bold/i, 700],
];

function weightFromStyle(style: string): number {
  for (const [pattern, weight] of WEIGHT_WORDS) if (pattern.test(style)) return weight;
  return 400;
}

/** True when the Local Font Access API is available (options page, after a permission prompt). */
export function canQueryLocalFonts(): boolean {
  return typeof window.queryLocalFonts === 'function';
}

/** Lists every installed face of `family` exactly, via the Local Font Access API. */
export async function queryFaces(family: string): Promise<LocalFace[]> {
  const fonts = (await window.queryLocalFonts?.()) ?? [];
  const wanted = family.toLowerCase();
  return fonts
    .filter((font) => font.family.toLowerCase() === wanted)
    .map((font) => ({
      local: [...new Set([font.fullName, font.postscriptName])],
      weight: String(weightFromStyle(font.style)),
      style: /italic|oblique/i.test(font.style) ? ('italic' as const) : ('normal' as const),
    }));
}
