/** Derives what the engine must track and apply from an effective profile. */

import { getLanguage, type ScriptId } from '../lib/languages';
import type { LanguageFont, Profile } from '../lib/settings';

export interface PlannedLanguage {
  id: string;
  script: ScriptId;
  font: LanguageFont;
  /** Line spacing factor for paragraphs in this language (the profile's when not set). */
  spacing: number;
  /** Weight change for paragraphs in this language (the profile's when not set). */
  weightDelta: number;
}

export interface Plan {
  profile: Profile;
  /** Text size factor. */
  z: number;
  /** Line spacing factor. */
  spacing: number;
  weightDelta: number;
  /** Configured languages in the order the user added them. */
  languages: PlannedLanguage[];
  /** Any line spacing (profile or language) other than 100%, so `line-height: normal` needs a rule. */
  anySpacing: boolean;
  /** Tag font-family boundaries (any font replacement). */
  trackFamily: boolean;
  /** Tag line-height boundaries (glyph scale or spacing changes). */
  trackLh: boolean;
  /** Tag font-weight boundaries. */
  trackWeight: boolean;
  /** Tag `lang` boundaries. */
  trackLang: boolean;
  /** Detect the language of unmarked paragraphs. */
  detectLang: boolean;
  /** Emit `font-size-adjust` (any glyph scale other than 1). */
  adjust: boolean;
  /** Changes when the set of tracked boundaries changes, which needs a full re-scan. */
  key: string;
}

/** Builds the engine plan for a profile. */
export function createPlan(profile: Profile): Plan {
  const z = profile.size / 100;
  const spacing = profile.lineSpacing / 100;
  const languages: PlannedLanguage[] = Object.entries(profile.languages).flatMap(([id, font]) => {
    const language = getLanguage(id);
    if (!language) return [];
    return [
      {
        id,
        script: language.script,
        font,
        spacing: font.lineSpacing === undefined ? spacing : font.lineSpacing / 100,
        weightDelta: font.weight ?? profile.weight,
      },
    ];
  });
  const scripts = new Set(languages.map((language) => language.script));
  const languageSizes = languages.some((language) => language.font.size !== 100);
  // Paragraph-level language settings need every paragraph's language, marked or detected.
  const paragraphSettings =
    languageSizes || languages.some((language) => language.font.lineSpacing !== undefined || language.font.weight !== undefined);
  const matchFont = profile.matchSize && profile.font !== null;
  const matchCode = profile.matchSize && profile.codeFont !== null;

  const trackLang = languages.length > 0;
  // A code font replaces `monospace`, which can change the computed size (see classify.ts),
  // so its size correction needs font-size-adjust too.
  const adjust = z !== 1 || matchFont || profile.codeFont !== null || languageSizes || matchCode;
  const trackWeight = profile.weight !== 0 || languages.some((language) => language.weightDelta !== 0);
  // The `font` shorthand resets `font-size-adjust`, so scaling needs a rule on every element
  // that sets its own font, which is exactly the set of family boundaries. Weight changes
  // need them too, to recognize icon fonts whose weight selects the icon style.
  const trackFamily = profile.font !== null || profile.codeFont !== null || trackLang || adjust || trackWeight;
  const anySpacing = spacing !== 1 || languages.some((language) => language.spacing !== 1);
  const trackLh = adjust || anySpacing;
  const detectLang = trackLang && (paragraphSettings || scripts.size < languages.length);

  return {
    profile,
    z,
    spacing,
    weightDelta: profile.weight,
    languages,
    anySpacing,
    trackFamily,
    trackLh,
    trackWeight,
    trackLang,
    detectLang,
    adjust,
    key: [trackFamily, trackLh, trackWeight, trackLang, detectLang, anySpacing, profile.codeFont !== null].join(),
  };
}
