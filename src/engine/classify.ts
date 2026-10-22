/** Classifies page font families so icon, emoji and code fonts are handled correctly. */

export type FamilyKind = 'text' | 'icon' | 'emoji' | 'mono' | 'monoGeneric';

const ICON_FONT =
  /awesome|icon|glyph|material (symbols|icons)|symbols (outlined|rounded|sharp)|google symbols|fontello|icomoon|dashicons|octicon|codicon|feather|remixicon|lucide|tabler|phosphor|eicons|themify|simple-line|typicons|entypo|elusive|fabric ?mdl2|segoe (mdl2|fluent) (assets|icons)|\bmdi\b|icofont|flaticon|weathericons|genericons|socicon|swiper-icons|slick/i;
const EMOJI_FONT = /emoji/i;
const MONO_FONT =
  /mono|consolas|courier|menlo|monaco|\bcode\b|inconsolata|\bhack\b|lucida console|lucida sans typewriter|fixedsys|terminal/i;

/** The sentinel family appended to every rewritten family list, e.g. `__gfc3`. */
export function sentinelName(id: number): string {
  return `__gfc${id}`;
}

const SENTINEL = /__gfc(\d+)/;

/** Returns the family id encoded in a computed family list, if it carries our sentinel. */
export function readSentinel(family: string): number | undefined {
  const match = SENTINEL.exec(family);
  return match ? Number(match[1]) : undefined;
}

/** Returns the first family of a computed `font-family` list, unquoted. */
export function firstFamily(family: string): string {
  const match = /^\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^,]*))/.exec(family);
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
}

/** Classifies a computed `font-family` list by its first family. */
export function classifyFamily(family: string): FamilyKind {
  if (family.trim() === 'monospace') return 'monoGeneric';
  const first = firstFamily(family);
  if (EMOJI_FONT.test(first)) return 'emoji';
  if (ICON_FONT.test(first)) return 'icon';
  if (first === 'monospace' || MONO_FONT.test(first)) return 'mono';
  return 'text';
}

const PUA = /^[\s\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]+$/u;

/** True when text consists only of Private Use Area characters, the hallmark of icon fonts. */
export function isPrivateUseText(text: string): boolean {
  return text.trim().length > 0 && PUA.test(text);
}

/** CSS Fonts 4 relative weight table for `bolder`. */
export function bolder(weight: number): number {
  if (weight < 350) return 400;
  if (weight < 550) return 700;
  return Math.max(900, weight);
}
