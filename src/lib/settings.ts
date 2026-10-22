/**
 * Settings model shared by the engine, popup, options page and background.
 * Everything read from storage or imported from a file goes through the
 * `normalize*` functions, so the rest of the code can trust the shapes.
 */

import { getLanguage } from './languages';

export interface LocalFace {
  /** `local()` names that resolve to this face, most specific first. */
  local: string[];
  /** CSS `font-weight` descriptor, e.g. `400` or `100 900` for variable faces. */
  weight: string;
  style: 'normal' | 'italic';
}

export interface LanguageFont {
  family: string;
  /** Resolved faces; empty when none could be resolved (see `fonts.ts`). */
  faces: LocalFace[];
  /** Text size for paragraphs in this language, in percent. */
  size: number;
  /** Line spacing for paragraphs in this language, in percent; absent follows the profile. */
  lineSpacing?: number;
  /** Weight change for paragraphs in this language; absent follows the profile. */
  weight?: number;
}

export interface Profile {
  /** Replacement font family, or `null` to keep the site's fonts. */
  font: string | null;
  /** Size replacement fonts to the x-height of the font they replace. */
  matchSize: boolean;
  /** Text size in percent of the site's own size. */
  size: number;
  /** Line spacing in percent of the site's own spacing. */
  lineSpacing: number;
  /** Weight change added to every weight, in CSS weight units. */
  weight: number;
  /** Replacement for monospace (code) fonts, or `null` to keep them. */
  codeFont: string | null;
  languages: Record<string, LanguageFont>;
}

export interface GlobalSettings extends Profile {
  /** When false, the all-sites defaults are paused; site settings still apply. */
  enabled: boolean;
}

/** Per-site overrides. A `null` language entry removes an all-sites language font. */
export interface SiteSettings extends Partial<Omit<Profile, 'languages'>> {
  enabled?: boolean;
  languages?: Record<string, LanguageFont | null>;
}

export type ProfileField = keyof Profile;

export const LIMITS = {
  size: { min: 50, max: 200, step: 5 },
  lineSpacing: { min: 80, max: 200, step: 5 },
  weight: { min: -300, max: 300, step: 100 },
  languageSize: { min: 50, max: 200, step: 5 },
} as const;

export const DEFAULT_PROFILE: Readonly<Profile> = Object.freeze({
  font: null,
  matchSize: true,
  size: 100,
  lineSpacing: 100,
  weight: 0,
  codeFont: null,
  languages: {},
});

export const DEFAULT_GLOBAL: Readonly<GlobalSettings> = Object.freeze({ ...DEFAULT_PROFILE, enabled: true });

export const PROFILE_FIELDS: readonly ProfileField[] = [
  'font',
  'matchSize',
  'size',
  'lineSpacing',
  'weight',
  'codeFont',
  'languages',
];

const MAX_FAMILY_LENGTH = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeFamily(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const family = value.trim().slice(0, MAX_FAMILY_LENGTH);
  return family || null;
}

/** Clamps `value` into a limit and snaps it to the limit's step. */
export function clampStep(value: unknown, limit: { min: number; max: number; step: number }, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  const snapped = Math.round(number / limit.step) * limit.step;
  return Math.min(limit.max, Math.max(limit.min, snapped));
}

function normalizeFace(value: unknown): LocalFace | null {
  if (!isRecord(value) || !Array.isArray(value.local)) return null;
  const local = value.local.filter((name): name is string => typeof name === 'string' && !!name.trim()).slice(0, 8);
  if (!local.length) return null;
  const weight = typeof value.weight === 'string' && /^\d{1,4}( \d{1,4})?$/.test(value.weight) ? value.weight : '400';
  return { local, weight, style: value.style === 'italic' ? 'italic' : 'normal' };
}

function normalizeLanguageFont(value: unknown): LanguageFont | null {
  if (!isRecord(value)) return null;
  const family = normalizeFamily(value.family);
  if (!family) return null;
  const faces = Array.isArray(value.faces)
    ? value.faces.map(normalizeFace).filter((face): face is LocalFace => !!face).slice(0, 8)
    : [];
  const font: LanguageFont = { family, faces, size: clampStep(value.size, LIMITS.languageSize, 100) };
  const lineSpacing = optionalStep(value.lineSpacing, LIMITS.lineSpacing);
  const weight = optionalStep(value.weight, LIMITS.weight);
  if (lineSpacing !== undefined) font.lineSpacing = lineSpacing;
  if (weight !== undefined) font.weight = weight;
  return font;
}

/** Like `clampStep`, but keeps a missing or invalid value missing. */
function optionalStep(value: unknown, limit: { min: number; max: number; step: number }): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return clampStep(value, limit, 0);
}

function normalizeLanguages(value: unknown, allowNull: boolean): Record<string, LanguageFont | null> {
  const languages: Record<string, LanguageFont | null> = {};
  if (!isRecord(value)) return languages;
  for (const [id, entry] of Object.entries(value)) {
    if (!getLanguage(id)) continue;
    if (entry === null && allowNull) {
      languages[id] = null;
      continue;
    }
    const font = normalizeLanguageFont(entry);
    if (font) languages[id] = font;
  }
  return languages;
}

/** Reads a field of a stored profile, returning `undefined` when it is absent or invalid. */
function readField(source: Record<string, unknown>, field: ProfileField): unknown {
  if (!(field in source)) return undefined;
  const value = source[field];
  switch (field) {
    case 'font':
    case 'codeFont':
      return value === null ? null : (normalizeFamily(value) ?? undefined);
    case 'matchSize':
      return typeof value === 'boolean' ? value : undefined;
    case 'size':
      return value === undefined ? undefined : clampStep(value, LIMITS.size, 100);
    case 'lineSpacing':
      return value === undefined ? undefined : clampStep(value, LIMITS.lineSpacing, 100);
    case 'weight':
      return value === undefined ? undefined : clampStep(value, LIMITS.weight, 0);
    case 'languages':
      return undefined;
  }
}

/** Validates stored or imported all-sites settings, filling gaps with defaults. */
export function normalizeGlobal(value: unknown): GlobalSettings {
  const source = isRecord(value) ? value : {};
  const settings: GlobalSettings = { ...DEFAULT_GLOBAL, languages: {} };
  for (const field of PROFILE_FIELDS) {
    const read = readField(source, field);
    if (read !== undefined) Object.assign(settings, { [field]: read });
  }
  settings.languages = normalizeLanguages(source.languages, false) as Record<string, LanguageFont>;
  settings.enabled = typeof source.enabled === 'boolean' ? source.enabled : true;
  return settings;
}

/** Validates stored or imported site overrides, keeping only valid fields. */
export function normalizeSite(value: unknown): SiteSettings {
  const source = isRecord(value) ? value : {};
  const settings: SiteSettings = {};
  for (const field of PROFILE_FIELDS) {
    const read = readField(source, field);
    if (read !== undefined) Object.assign(settings, { [field]: read });
  }
  if ('languages' in source) {
    const languages = normalizeLanguages(source.languages, true);
    if (Object.keys(languages).length) settings.languages = languages;
  }
  if (typeof source.enabled === 'boolean') settings.enabled = source.enabled;
  return settings;
}

/** True when a site entry holds nothing and can be deleted from storage. */
export function isEmptySite(site: SiteSettings): boolean {
  return Object.keys(site).length === 0 || (Object.keys(site).length === 1 && site.enabled === true);
}

export interface Effective {
  /** False when the user turned the extension off for this site. */
  enabled: boolean;
  profile: Profile;
  /** Whether the profile comes from site overrides, all-sites defaults, or neither. */
  source: 'site' | 'global' | 'none';
}

/** Merges site overrides over the all-sites defaults. */
export function resolveEffective(global: GlobalSettings, site: SiteSettings | undefined): Effective {
  const base: Profile = global.enabled
    ? { ...pickProfile(global), languages: { ...global.languages } }
    : { ...DEFAULT_PROFILE, languages: {} };
  const profile: Profile = { ...base, languages: { ...base.languages } };
  let hasSiteFields = false;
  if (site) {
    for (const field of PROFILE_FIELDS) {
      if (field === 'languages' || site[field] === undefined) continue;
      Object.assign(profile, { [field]: site[field] });
      hasSiteFields = true;
    }
    for (const [id, font] of Object.entries(site.languages ?? {})) {
      hasSiteFields = true;
      if (font) profile.languages[id] = font;
      else delete profile.languages[id];
    }
  }
  const enabled = site?.enabled !== false;
  const active = enabled && isActiveProfile(profile);
  return {
    enabled,
    profile,
    source: !active ? 'none' : hasSiteFields ? 'site' : 'global',
  };
}

/** Copies the profile fields out of a settings object. */
export function pickProfile(settings: Profile): Profile {
  return {
    font: settings.font,
    matchSize: settings.matchSize,
    size: settings.size,
    lineSpacing: settings.lineSpacing,
    weight: settings.weight,
    codeFont: settings.codeFont,
    languages: { ...settings.languages },
  };
}

/** True when the profile changes anything on a page. */
export function isActiveProfile(profile: Profile): boolean {
  return (
    profile.font !== null ||
    profile.codeFont !== null ||
    profile.size !== 100 ||
    profile.lineSpacing !== 100 ||
    profile.weight !== 0 ||
    Object.keys(profile.languages).length > 0
  );
}

/** Legacy (3.x) storage shape: `settingsByDomain[host] = { font, fontSize, scaling }`. */
interface LegacySite {
  font?: unknown;
  fontSize?: unknown;
  scaling?: unknown;
}

/**
 * Converts 3.x per-domain settings. `font` (a `fontSettings` font id, which is
 * the family name) maps to `font`; the pixel `fontSize` delta maps to a percent
 * of a 16 px base. `scaling` is dropped because page zoom is now the browser's
 * own per-site zoom, which keeps its own storage.
 */
export function migrateLegacy(legacy: unknown): Record<string, SiteSettings> {
  const sites: Record<string, SiteSettings> = {};
  if (!isRecord(legacy)) return sites;
  for (const [host, value] of Object.entries(legacy)) {
    if (!isRecord(value)) continue;
    const entry = value as LegacySite;
    const site: SiteSettings = {};
    const font = normalizeFamily(entry.font);
    if (font) site.font = font;
    const delta = Number(entry.fontSize);
    if (Number.isFinite(delta) && delta !== 0) site.size = clampStep(((16 + delta) / 16) * 100, LIMITS.size, 100);
    if (Object.keys(site).length) sites[host] = site;
  }
  return sites;
}
