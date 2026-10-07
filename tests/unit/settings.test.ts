import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GLOBAL,
  isActiveProfile,
  isEmptySite,
  migrateLegacy,
  normalizeGlobal,
  normalizeSite,
  resolveEffective,
} from '../../src/lib/settings';

const urdu = { family: 'Jameel Noori Nastaleeq', faces: [{ local: ['Jameel Noori Nastaleeq'], weight: '400', style: 'normal' }], size: 120 };

describe('normalizeGlobal', () => {
  it('fills defaults for missing or broken data', () => {
    expect(normalizeGlobal(undefined)).toEqual(DEFAULT_GLOBAL);
    expect(normalizeGlobal('nonsense')).toEqual(DEFAULT_GLOBAL);
  });

  it('clamps and snaps numbers to their limits', () => {
    const settings = normalizeGlobal({ size: 999, lineSpacing: 12, weight: 149, matchSize: 'yes' });
    expect(settings.size).toBe(200);
    expect(settings.lineSpacing).toBe(80);
    expect(settings.weight).toBe(100);
    expect(settings.matchSize).toBe(true);
  });

  it('keeps valid languages and drops unknown or invalid ones', () => {
    const settings = normalizeGlobal({ languages: { ur: urdu, xx: urdu, ar: { family: '' }, fa: null } });
    expect(settings.languages).toEqual({ ur: urdu });
  });

  it('rejects malformed faces', () => {
    const settings = normalizeGlobal({ languages: { ur: { ...urdu, faces: [{ local: [] }, { local: ['A'], weight: 'bold', style: 'x' }] } } });
    expect(settings.languages.ur!.faces).toEqual([{ local: ['A'], weight: '400', style: 'normal' }]);
  });
});

describe('normalizeSite', () => {
  it('keeps only fields that are present and valid', () => {
    expect(normalizeSite({ size: 130, font: '  Georgia ', bogus: 1 })).toEqual({ size: 130, font: 'Georgia' });
    expect(normalizeSite({ font: null, codeFont: '' })).toEqual({ font: null });
  });

  it('keeps explicit language removals', () => {
    expect(normalizeSite({ languages: { ur: null } })).toEqual({ languages: { ur: null } });
  });

  it('treats an entry with nothing but the default switch as empty', () => {
    expect(isEmptySite({})).toBe(true);
    expect(isEmptySite({ enabled: true })).toBe(true);
    expect(isEmptySite({ enabled: false })).toBe(false);
  });
});

describe('resolveEffective', () => {
  const global = normalizeGlobal({ font: 'Segoe UI', size: 110, languages: { ur: urdu } });

  it('uses the all-sites defaults when the site has no settings', () => {
    const effective = resolveEffective(global, undefined);
    expect(effective).toMatchObject({ enabled: true, source: 'global', profile: { font: 'Segoe UI', size: 110 } });
  });

  it('overrides field by field', () => {
    const effective = resolveEffective(global, { size: 130 });
    expect(effective.profile).toMatchObject({ font: 'Segoe UI', size: 130 });
    expect(effective.source).toBe('site');
  });

  it('removes a default language with a null override', () => {
    expect(resolveEffective(global, { languages: { ur: null } }).profile.languages).toEqual({});
  });

  it('reports a disabled site', () => {
    expect(resolveEffective(global, { enabled: false })).toMatchObject({ enabled: false, source: 'none' });
  });

  it('ignores paused defaults but keeps site settings', () => {
    const paused = { ...global, enabled: false };
    expect(resolveEffective(paused, undefined).source).toBe('none');
    expect(resolveEffective(paused, { size: 120 }).profile).toMatchObject({ font: null, size: 120 });
  });

  it('knows when a profile changes nothing', () => {
    expect(isActiveProfile(DEFAULT_GLOBAL)).toBe(false);
    expect(isActiveProfile({ ...DEFAULT_GLOBAL, weight: 100 })).toBe(true);
  });
});

describe('migrateLegacy', () => {
  it('maps 3.x fonts and pixel deltas, and drops page scaling', () => {
    const sites = migrateLegacy({
      'www.example.com': { font: 'Georgia', fontSize: 2, scaling: 1.2 },
      'news.test': { fontSize: -4 },
      'zoom.only': { scaling: 1.1 },
      'zero.delta': { fontSize: 0 },
      broken: 'x',
    });
    expect(sites).toEqual({
      'www.example.com': { font: 'Georgia', size: 115 },
      'news.test': { size: 75 },
    });
  });
});
