import { describe, expect, it } from 'vitest';
import { bolder, classifyFamily, firstFamily, isPrivateUseText, readSentinel, sentinelName } from '../../src/engine/classify';
import { buildFontFaces, buildSheet, familyAttrValue, familyRule, familyScale } from '../../src/engine/css';
import { createPlan } from '../../src/engine/plan';
import { DEFAULT_PROFILE, type Profile } from '../../src/lib/settings';

function profile(overrides: Partial<Profile>): Profile {
  return { ...DEFAULT_PROFILE, languages: {}, ...overrides };
}

const urdu = { family: 'Jameel Noori Nastaleeq', faces: [{ local: ['Jameel Noori Nastaleeq'], weight: '400', style: 'normal' as const }], size: 120 };

describe('classifyFamily', () => {
  it.each([
    ['"Segoe UI", Roboto, sans-serif', 'text'],
    ['"Font Awesome 6 Free"', 'icon'],
    ['"Material Symbols Outlined"', 'icon'],
    ['"Apple Color Emoji", sans-serif', 'emoji'],
    ['monospace', 'monoGeneric'],
    ['Consolas, monospace', 'mono'],
    ['"Fira Code", monospace', 'mono'],
    ['ui-monospace, SFMono-Regular', 'mono'],
    ['Roboto, "Segoe UI Symbol"', 'text'],
  ])('%s is %s', (family, kind) => {
    expect(classifyFamily(family)).toBe(kind);
  });

  it('reads the first family with or without quotes', () => {
    expect(firstFamily('"A, B", C')).toBe('A, B');
    expect(firstFamily("  'Inter' , x")).toBe('Inter');
    expect(firstFamily('Arial, sans-serif')).toBe('Arial');
  });

  it('round-trips the sentinel the way Chrome serializes it', () => {
    expect(readSentinel(`Georgia, Arial, ${sentinelName(12)}`)).toBe(12);
    expect(readSentinel('Georgia, Arial')).toBeUndefined();
  });

  it('recognizes private-use icon text', () => {
    expect(isPrivateUseText('\uE700')).toBe(true);
    expect(isPrivateUseText(' \uF101 ')).toBe(true);
    expect(isPrivateUseText('home')).toBe(false);
    expect(isPrivateUseText('  ')).toBe(false);
  });

  it('follows the CSS bolder table', () => {
    expect([100, 400, 600, 900].map(bolder)).toEqual([400, 700, 900, 900]);
  });
});

describe('createPlan', () => {
  it('tracks nothing for an inactive profile', () => {
    const plan = createPlan(profile({}));
    expect([plan.trackFamily, plan.trackLh, plan.trackWeight, plan.trackLang, plan.adjust]).toEqual([false, false, false, false, false]);
  });

  it('tracks family boundaries whenever text is scaled', () => {
    const plan = createPlan(profile({ size: 120 }));
    expect(plan).toMatchObject({ trackFamily: true, trackLh: true, adjust: true });
  });

  it('detects unmarked languages only when it matters', () => {
    expect(createPlan(profile({ languages: { ur: urdu } })).detectLang).toBe(true);
    expect(createPlan(profile({ languages: { ur: { ...urdu, size: 100 } } })).detectLang).toBe(false);
    expect(createPlan(profile({ languages: { ur: { ...urdu, size: 100 }, ar: { ...urdu, size: 100 } } })).detectLang).toBe(true);
  });

  it('changes its key only when the tracked boundaries change', () => {
    expect(createPlan(profile({ size: 110 })).key).toBe(createPlan(profile({ size: 150 })).key);
    expect(createPlan(profile({ size: 100 })).key).not.toBe(createPlan(profile({ size: 110 })).key);
  });
});

describe('css', () => {
  const text = { id: 3, list: 'Georgia, serif', kind: 'text' as const, exAspect: 0.48 };

  it('scales by text size and x-height match', () => {
    const plan = createPlan(profile({ font: 'Verdana', matchSize: true, size: 150 }));
    expect(familyScale(plan, text, { mainAspect: 0.545 })).toBeCloseTo(1.5 * (0.48 / 0.545), 5);
    expect(familyScale(plan, text, {})).toBe(1.5);
  });

  it('keeps a replaced family list as fallback behind the sentinel', () => {
    const plan = createPlan(profile({ font: 'Verdana' }));
    const rule = familyRule(plan, text, {});
    expect(rule).toContain('[data-gfc-f="3"]');
    expect(rule).toContain('--gfc-o: Georgia, serif, "__gfc3"');
    expect(rule).toContain('--gfc-main: "Verdana",');
  });

  it('leaves bare monospace alone unless a code font is set', () => {
    const generic = { id: 4, list: 'monospace', kind: 'monoGeneric' as const };
    expect(familyAttrValue(createPlan(profile({ font: 'Verdana' })), generic)).toBe('k4');
    expect(familyAttrValue(createPlan(profile({ codeFont: 'Consolas' })), generic)).toBe('4');
  });

  it('keeps icon weights', () => {
    const plan = createPlan(profile({ weight: 200 }));
    expect(familyRule(plan, { id: 1, list: '"Font Awesome 6 Free"', kind: 'icon' }, {})).toContain('--gfc-wd: 0');
    expect(familyRule(plan, text, {})).toContain('--gfc-wd: 200');
  });

  it('escapes font names', () => {
    const plan = createPlan(profile({ font: 'Evil"} body{color:red' }));
    expect(familyRule(plan, text, {})).toContain('--gfc-main: "Evil\\"} body{color:red",');
  });

  it('emits only the rules a plan needs', () => {
    const sizeOnly = buildSheet(createPlan(profile({ size: 120 })), [], {});
    expect(sizeOnly).toContain('font-size-adjust: ic-width');
    expect(sizeOnly).not.toContain('font-weight');
    expect(sizeOnly).not.toContain('data-gfc-lnorm');
    const spacing = buildSheet(createPlan(profile({ lineSpacing: 150 })), [], {});
    expect(spacing).toContain('[data-gfc-lnorm]');
  });

  it('builds unicode-range faces per language', () => {
    const faces = buildFontFaces(createPlan(profile({ languages: { ur: urdu } })));
    expect(faces).toContain('font-family: "gfc-l-ur"');
    expect(faces).toContain('src: local("Jameel Noori Nastaleeq")');
    expect(faces).toContain('unicode-range: U+0600-06FF');
  });

  it('puts faces it could not resolve after the main font', () => {
    const sheet = buildSheet(createPlan(profile({ languages: { ur: { ...urdu, faces: [] } } })), [], {});
    expect(sheet).toContain('--gfc-lt: "Jameel Noori Nastaleeq",');
  });
});
