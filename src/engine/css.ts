/**
 * Pure CSS builder. Settings become custom properties on tagged boundary
 * elements; every other element inherits the result, so the DOM only carries
 * attributes where a site's own typography changes.
 */

import { cssFamily } from '../lib/fonts';
import { SCRIPTS } from '../lib/languages';
import type { FamilyKind } from './classify';
import { sentinelName } from './classify';
import type { Plan, PlannedLanguage } from './plan';

export const ATTR = {
  family: 'data-gfc-f',
  lhNumber: 'data-gfc-ln',
  lhLength: 'data-gfc-lp',
  lhNormal: 'data-gfc-lnorm',
  weight: 'data-gfc-w',
  lang: 'data-gfc-g',
} as const;

export const ALL_ATTRS: readonly string[] = Object.values(ATTR);

/** A page font family list registered by the engine. */
export interface FamilyInfo {
  id: number;
  /** The computed `font-family` value exactly as the page set it. */
  list: string;
  kind: FamilyKind;
  /** `ex-height` aspect of the list's first available font. */
  exAspect?: number;
  /** `line-height: normal` divided by font size, for the list as rendered after replacement. */
  normalRatio?: number;
  /** Correction when replacing bare `monospace` changes the computed font size. */
  sizeFix?: number;
}

/** Measured metrics of the replacement fonts. */
export interface FontMetrics {
  /** `ex-height` aspects of the main and code fonts, used to match x-heights. */
  mainAspect?: number;
  codeAspect?: number;
  /** `line-height: normal` ratio of each language's font, by language id. */
  languageNormal?: Record<string, number>;
}

const LANG_FACE_PREFIX = 'gfc-l-';

function num(value: number): string {
  return String(Math.round(value * 10000) / 10000);
}

/** True when the family keeps the site's own font (not rewritten). */
export function isKeptGeneric(plan: Plan, family: FamilyInfo): boolean {
  return family.kind === 'monoGeneric' && plan.profile.codeFont === null;
}

/** Attribute value for a family: kept bare `monospace` lists are prefixed so they skip the rewrite rule. */
export function familyAttrValue(plan: Plan, family: FamilyInfo): string {
  return isKeptGeneric(plan, family) ? `k${family.id}` : String(family.id);
}

function replacementFor(plan: Plan, kind: FamilyKind): string | null {
  if (kind === 'text') return plan.profile.font;
  if (kind === 'mono' || kind === 'monoGeneric') return plan.profile.codeFont;
  return null;
}

function matchRatio(plan: Plan, family: FamilyInfo, metrics: FontMetrics): number {
  if (!plan.profile.matchSize || !family.exAspect) return 1;
  const isCode = family.kind === 'mono' || family.kind === 'monoGeneric';
  const target = isCode ? metrics.codeAspect : metrics.mainAspect;
  if (!replacementFor(plan, family.kind) || !target) return 1;
  // Guard against broken font metrics producing absurd sizes.
  return Math.min(2, Math.max(0.5, family.exAspect / target));
}

/** Glyph scale for a family: text size, x-height match and the monospace size fix. */
export function familyScale(plan: Plan, family: FamilyInfo, metrics: FontMetrics): number {
  return plan.z * matchRatio(plan, family, metrics) * (family.sizeFix ?? 1);
}

/** The rule that sets a family's custom properties. */
export function familyRule(plan: Plan, family: FamilyInfo, metrics: FontMetrics): string {
  const declarations: string[] = [];
  if (isKeptGeneric(plan, family)) {
    declarations.push('--gfc-o: monospace', '--gfc-main: initial');
  } else {
    const replacement = replacementFor(plan, family.kind);
    declarations.push(`--gfc-o: ${family.list}, "${sentinelName(family.id)}"`);
    declarations.push(`--gfc-main: ${replacement ? `${cssFamily(replacement)},` : 'initial'}`);
  }
  declarations.push(`--gfc-zf: ${num(familyScale(plan, family, metrics))}`);
  if (plan.trackWeight) {
    const keepsWeight = family.kind === 'icon' || family.kind === 'emoji';
    declarations.push(`--gfc-wd: ${keepsWeight ? 0 : plan.weightDelta}`);
    // Icons inside a paragraph with a language weight keep their weight too.
    if (keepsWeight) declarations.push('--gfc-wl: 0');
  }
  if (plan.anySpacing && family.normalRatio) declarations.push(`--gfc-nr: ${num(family.normalRatio)}`);
  return `[${ATTR.family}="${familyAttrValue(plan, family)}"] { ${declarations.join('; ')}; }`;
}

function faceFamily(language: PlannedLanguage): string {
  return `"${LANG_FACE_PREFIX}${language.id}"`;
}

/**
 * The font list a language's paragraphs render with: its range-limited face before the main
 * font, or its family after the main font when no face could be resolved.
 */
export function languageFamilyList(plan: Plan, language: PlannedLanguage): string {
  const main = plan.profile.font ? `${cssFamily(plan.profile.font)}, ` : '';
  return language.font.faces.length
    ? `${faceFamily(language)}, ${main}sans-serif`
    : `${main}${cssFamily(language.font.family)}, sans-serif`;
}

function fontFaceRules(plan: Plan): string[] {
  return plan.languages.flatMap((language) =>
    language.font.faces.map(
      (face) =>
        `@font-face { font-family: ${faceFamily(language)}; src: ${face.local.map((name) => `local(${cssFamily(name)})`).join(', ')}; ` +
        `font-weight: ${face.weight}; font-style: ${face.style}; unicode-range: ${SCRIPTS[language.script].unicodeRange}; }`,
    ),
  );
}

/** The first configured language of each script is that script's default. */
function scriptDefaults(plan: Plan): PlannedLanguage[] {
  const seen = new Set<string>();
  return plan.languages.filter((language) => !seen.has(language.script) && seen.add(language.script));
}

interface LanguageLists {
  /** Range-limited faces placed before the main font. */
  faces: string;
  /** Families that could not be range-limited, placed after the main font. */
  tail: string;
}

function languageLists(primary: PlannedLanguage | undefined, defaults: PlannedLanguage[]): LanguageLists {
  const ordered = primary ? [primary, ...defaults.filter((language) => language.script !== primary.script)] : defaults;
  const faces = ordered.filter((language) => language.font.faces.length).map((language) => `${faceFamily(language)},`);
  const tail = ordered.filter((language) => !language.font.faces.length).map((language) => `${cssFamily(language.font.family)},`);
  return { faces: faces.join(' ') || 'initial', tail: tail.join(' ') || 'initial' };
}

/** Builds the rule stylesheet text for a plan and the families registered so far. */
export function buildSheet(plan: Plan, families: Iterable<FamilyInfo>, metrics: FontMetrics): string {
  const defaults = scriptDefaults(plan);
  const rootLists = languageLists(undefined, defaults);
  const scale = `var(--gfc-zf, 1) * var(--gfc-zl, 1)`;
  const rules: string[] = [];

  rules.push(
    `:root { --gfc-zf: ${num(plan.z)}; --gfc-wd: ${plan.weightDelta}; --gfc-wl: 0; --gfc-ls: ${num(plan.spacing)}; ` +
      `--gfc-lf: ${rootLists.faces}; --gfc-lt: ${rootLists.tail}; }`,
  );

  if (plan.trackLang) {
    // Any language boundary first returns to the profile's values, e.g. English inside Urdu.
    rules.push(
      `[${ATTR.lang}] { --gfc-lf: ${rootLists.faces}; --gfc-lt: ${rootLists.tail}; --gfc-zl: 1; ` +
        `--gfc-ls: ${num(plan.spacing)}; --gfc-wl: 0; --gfc-nrl: initial; }`,
    );
    for (const language of plan.languages) {
      const lists = languageLists(language, defaults);
      const normal = metrics.languageNormal?.[language.id];
      rules.push(
        `[${ATTR.lang}="${language.id}"] { --gfc-lf: ${lists.faces}; --gfc-lt: ${lists.tail}; ` +
          `--gfc-zl: ${num(language.font.size / 100)}; --gfc-ls: ${num(language.spacing)}; ` +
          `--gfc-wl: ${language.weightDelta - plan.weightDelta}${normal ? `; --gfc-nrl: ${num(normal)}` : ''}; }`,
      );
    }
  }

  if (plan.trackFamily) {
    rules.push(
      `:is([${ATTR.family}]:not([${ATTR.family}^="k"]), [${ATTR.lang}]) { font-family: var(--gfc-lf,) var(--gfc-main,) var(--gfc-lt,) var(--gfc-o) !important; }`,
    );
  }

  if (plan.adjust) {
    // Family boundaries are tracked whenever text is scaled (see plan.ts).
    rules.push(`:is([${ATTR.family}], [${ATTR.lang}]) { font-size-adjust: ic-width calc(${scale}) !important; }`);
    // Charts and formulas have fixed geometry; scaling their text would overlap it.
    rules.push(`svg, math { font-size-adjust: none !important; }`);
  }

  if (plan.trackLh) {
    const factor = `${scale} * var(--gfc-ls, 1)`;
    rules.push(`[${ATTR.lhNumber}] { line-height: calc(attr(${ATTR.lhNumber} type(<number>), 1.2) * ${factor}) !important; }`);
    rules.push(`[${ATTR.lhLength}] { line-height: calc(attr(${ATTR.lhLength} type(<length>), 0px) * ${factor}) !important; }`);
    if (plan.anySpacing) {
      // A language's own font (e.g. tall Nastaliq) sets the normal line height in its paragraphs.
      rules.push(`[${ATTR.lhNormal}] { line-height: calc(var(--gfc-nrl, var(--gfc-nr, 1.2)) * ${factor}) !important; }`);
    }
  }

  if (plan.trackWeight) {
    rules.push(
      `[${ATTR.weight}] { font-weight: clamp(1, attr(${ATTR.weight} type(<number>), 400) + var(--gfc-wd, 0) + var(--gfc-wl, 0), 1000) !important; }`,
    );
  }

  for (const family of families) rules.push(familyRule(plan, family, metrics));

  return `@layer gfc {\n${rules.join('\n')}\n}`;
}

/**
 * Builds the language `@font-face` rules. They live in their own sheet: replacing a sheet
 * re-creates its font faces, which load again, so they change only with the language setup.
 */
export function buildFontFaces(plan: Plan): string {
  return fontFaceRules(plan).join('\n');
}
