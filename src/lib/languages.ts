/**
 * Catalog of languages that can get their own font. Languages that share a
 * script (Urdu, Arabic, Persian) share Unicode ranges, so the engine tells
 * them apart by `lang` attributes or by letters unique to each language.
 */

export type ScriptId =
  | 'arab'
  | 'deva'
  | 'beng'
  | 'guru'
  | 'gujr'
  | 'taml'
  | 'telu'
  | 'hebr'
  | 'thai'
  | 'cyrl'
  | 'grek'
  | 'hani'
  | 'jpan'
  | 'kore';

export interface Script {
  id: ScriptId;
  /** CSS `unicode-range` value for the script's faces. */
  unicodeRange: string;
  /** Matches one character of the script (by Unicode script property), for dominant-script detection. */
  chars: RegExp;
}

export interface Language {
  id: string;
  label: string;
  nativeLabel: string;
  script: ScriptId;
  /** Letters that only this language uses within its script. */
  distinct?: RegExp;
  /** Sample text for previews. */
  sample: string;
}

const CJK_COMMON = 'U+3000-303F, U+3200-32FF, U+3300-33FF, U+FE30-FE4F, U+FF00-FFEF';
const HAN = 'U+2E80-2FDF, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+20000-2FA1F';

export const SCRIPTS: Record<ScriptId, Script> = {
  arab: {
    id: 'arab',
    unicodeRange: 'U+0600-06FF, U+0750-077F, U+0870-089F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF',
    chars: /\p{Script=Arabic}/u,
  },
  deva: { id: 'deva', unicodeRange: 'U+0900-097F, U+1CD0-1CFF, U+A8E0-A8FF', chars: /\p{Script=Devanagari}/u },
  beng: { id: 'beng', unicodeRange: 'U+0980-09FF', chars: /\p{Script=Bengali}/u },
  guru: { id: 'guru', unicodeRange: 'U+0A00-0A7F', chars: /\p{Script=Gurmukhi}/u },
  gujr: { id: 'gujr', unicodeRange: 'U+0A80-0AFF', chars: /\p{Script=Gujarati}/u },
  taml: { id: 'taml', unicodeRange: 'U+0B80-0BFF', chars: /\p{Script=Tamil}/u },
  telu: { id: 'telu', unicodeRange: 'U+0C00-0C7F', chars: /\p{Script=Telugu}/u },
  hebr: { id: 'hebr', unicodeRange: 'U+0590-05FF, U+FB1D-FB4F', chars: /\p{Script=Hebrew}/u },
  thai: { id: 'thai', unicodeRange: 'U+0E00-0E7F', chars: /\p{Script=Thai}/u },
  cyrl: {
    id: 'cyrl',
    unicodeRange: 'U+0400-052F, U+1C80-1C8F, U+2DE0-2DFF, U+A640-A69F',
    chars: /\p{Script=Cyrillic}/u,
  },
  grek: { id: 'grek', unicodeRange: 'U+0370-03FF, U+1F00-1FFF', chars: /\p{Script=Greek}/u },
  hani: { id: 'hani', unicodeRange: `${HAN}, ${CJK_COMMON}`, chars: /\p{Script=Han}/u },
  jpan: {
    id: 'jpan',
    unicodeRange: `U+3040-30FF, U+31F0-31FF, ${HAN}, ${CJK_COMMON}`,
    chars: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
  },
  kore: {
    id: 'kore',
    unicodeRange: `U+1100-11FF, U+3130-318F, U+A960-A97F, U+AC00-D7AF, U+D7B0-D7FF, ${CJK_COMMON}`,
    chars: /\p{Script=Hangul}/u,
  },
};

export const LANGUAGES: readonly Language[] = [
  { id: 'ur', label: 'Urdu', nativeLabel: 'اردو', script: 'arab', distinct: /[\u0679\u0688\u0691\u06BA\u06BE\u06C1\u06D2]/u, sample: 'اردو زبان' },
  { id: 'ar', label: 'Arabic', nativeLabel: 'العربية', script: 'arab', sample: 'اللغة العربية' },
  { id: 'fa', label: 'Persian', nativeLabel: 'فارسی', script: 'arab', distinct: /[\u0698]/u, sample: 'زبان فارسی' },
  { id: 'ps', label: 'Pashto', nativeLabel: 'پښتو', script: 'arab', distinct: /[\u067C\u0681\u0685\u0689\u0693\u0696\u069A\u06BC]/u, sample: 'پښتو ژبه' },
  { id: 'sd', label: 'Sindhi', nativeLabel: 'سنڌي', script: 'arab', distinct: /[\u067A\u067B\u067D\u067F\u0680\u068A\u068C\u068D\u068E\u068F\u0699\u06A6\u06B3]/u, sample: 'سنڌي ٻولي' },
  { id: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', script: 'deva', sample: 'हिन्दी भाषा' },
  { id: 'mr', label: 'Marathi', nativeLabel: 'मराठी', script: 'deva', distinct: /[\u0933]/u, sample: 'मराठी भाषा' },
  { id: 'bn', label: 'Bengali', nativeLabel: 'বাংলা', script: 'beng', sample: 'বাংলা ভাষা' },
  { id: 'pa', label: 'Punjabi (Gurmukhi)', nativeLabel: 'ਪੰਜਾਬੀ', script: 'guru', sample: 'ਪੰਜਾਬੀ ਭਾਸ਼ਾ' },
  { id: 'gu', label: 'Gujarati', nativeLabel: 'ગુજરાતી', script: 'gujr', sample: 'ગુજરાતી ભાષા' },
  { id: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்', script: 'taml', sample: 'தமிழ் மொழி' },
  { id: 'te', label: 'Telugu', nativeLabel: 'తెలుగు', script: 'telu', sample: 'తెలుగు భాష' },
  { id: 'he', label: 'Hebrew', nativeLabel: 'עברית', script: 'hebr', sample: 'השפה העברית' },
  { id: 'th', label: 'Thai', nativeLabel: 'ไทย', script: 'thai', sample: 'ภาษาไทย' },
  { id: 'ru', label: 'Russian', nativeLabel: 'Русский', script: 'cyrl', sample: 'Русский язык' },
  { id: 'uk', label: 'Ukrainian', nativeLabel: 'Українська', script: 'cyrl', distinct: /[\u0404\u0406\u0407\u0454\u0456\u0457\u0490\u0491]/u, sample: 'Українська мова' },
  { id: 'el', label: 'Greek', nativeLabel: 'Ελληνικά', script: 'grek', sample: 'Ελληνική γλώσσα' },
  { id: 'zh', label: 'Chinese', nativeLabel: '中文', script: 'hani', sample: '中文字体' },
  { id: 'ja', label: 'Japanese', nativeLabel: '日本語', script: 'jpan', distinct: /[\u3040-\u30FF]/u, sample: '日本語のフォント' },
  { id: 'ko', label: 'Korean', nativeLabel: '한국어', script: 'kore', sample: '한국어 글꼴' },
];

const BY_ID = new Map(LANGUAGES.map((language) => [language.id, language]));

/** Returns the catalog entry for a language id, if it exists. */
export function getLanguage(id: string): Language | undefined {
  return BY_ID.get(id);
}

/** Maps a BCP 47 tag such as `ur-PK` or `zh-Hant` to a catalog language id. */
export function matchLanguageTag(tag: string): string | undefined {
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
  return primary && BY_ID.has(primary) ? primary : undefined;
}

/**
 * Returns the configured language that dominates `text`, `''` when another
 * script (usually Latin) dominates, or `undefined` when the sample is too short
 * to decide.
 */
export function detectLanguage(text: string, configured: readonly string[]): string | undefined {
  const languages = configured.map(getLanguage).filter((language): language is Language => !!language);
  if (!languages.length) return undefined;

  const counts = new Map<ScriptId, number>();
  let letters = 0;
  for (const char of text) {
    if (!/\p{L}/u.test(char)) continue;
    letters++;
    for (const language of languages) {
      const script = SCRIPTS[language.script];
      if (script.chars.test(char)) {
        counts.set(script.id, (counts.get(script.id) ?? 0) + 1);
        break;
      }
    }
  }
  if (letters < 3) return undefined;

  let best: ScriptId | undefined;
  let bestCount = 0;
  for (const [script, count] of counts) {
    if (count > bestCount) {
      best = script;
      bestCount = count;
    }
  }
  if (!best || bestCount * 2 < letters) return '';

  const candidates = languages.filter((language) => language.script === best);
  if (candidates.length === 1) return candidates[0]!.id;
  const distinct = candidates.find((language) => language.distinct?.test(text));
  // Without distinguishing letters the first configured language of the script wins.
  return (distinct ?? candidates.find((language) => !language.distinct) ?? candidates[0]!).id;
}
