import { describe, expect, it } from 'vitest';
import { applyCommand, isSiteCommand } from '../../src/lib/commands';
import { cssFamily } from '../../src/lib/fonts';
import { detectLanguage, matchLanguageTag } from '../../src/lib/languages';
import { normalizeGlobal, resolveEffective } from '../../src/lib/settings';
import { normalizeHost, siteFromStorageKey, siteKeyFromUrl, siteStorageKey } from '../../src/lib/site';

describe('site keys', () => {
  it.each([
    ['https://www.Example.com/path?q=1', 'example.com'],
    ['http://localhost:4789/a', 'localhost:4789'],
    ['https://mail.google.com/', 'mail.google.com'],
    ['file:///C:/notes.html', 'file'],
    ['chrome://extensions', null],
    ['https://chromewebstore.google.com/detail/x', null],
    ['not a url', null],
    [undefined, null],
  ])('%s -> %s', (url, key) => {
    expect(siteKeyFromUrl(url)).toBe(key);
  });

  it('round-trips storage keys', () => {
    expect(siteFromStorageKey(siteStorageKey('example.com'))).toBe('example.com');
    expect(siteFromStorageKey('global')).toBeNull();
    expect(normalizeHost('WWW.Example.COM.')).toBe('example.com');
  });
});

describe('languages', () => {
  it('maps BCP 47 tags to catalog languages', () => {
    expect(matchLanguageTag('ur-PK')).toBe('ur');
    expect(matchLanguageTag('zh_Hant')).toBe('zh');
    expect(matchLanguageTag('en')).toBeUndefined();
  });

  it('detects the dominant configured language', () => {
    expect(detectLanguage('یہ اردو کا ایک جملہ ہے', ['ur'])).toBe('ur');
    expect(detectLanguage('Only English text here', ['ur'])).toBe('');
    expect(detectLanguage('ab', ['ur'])).toBeUndefined();
    expect(detectLanguage('anything', [])).toBeUndefined();
  });

  it('tells Urdu from Arabic by Urdu-only letters', () => {
    expect(detectLanguage('یہ اردو کا ایک جملہ ہے', ['ar', 'ur'])).toBe('ur');
    expect(detectLanguage('اللغة العربية جميلة', ['ur', 'ar'])).toBe('ar');
  });

  it('tells Japanese from Chinese by kana', () => {
    expect(detectLanguage('日本語のフォントです', ['zh', 'ja'])).toBe('ja');
    expect(detectLanguage('中文字体很好看', ['zh', 'ja'])).toBe('zh');
  });
});

describe('commands', () => {
  const global = normalizeGlobal({ size: 110 });

  it('steps text size from the effective value', () => {
    expect(applyCommand('size-up', {}, resolveEffective(global, {}))).toEqual({ size: 120 });
    expect(applyCommand('size-down', { size: 50 }, resolveEffective(global, { size: 50 }))).toEqual({ size: 50 });
  });

  it('toggles a site and resets its size', () => {
    expect(applyCommand('toggle-site', {}, resolveEffective(global, {}))).toEqual({ enabled: false });
    expect(applyCommand('toggle-site', { enabled: false }, resolveEffective(global, { enabled: false }))).toEqual({});
    expect(applyCommand('size-reset', { size: 140, font: 'X' }, resolveEffective(global, { size: 140 }))).toEqual({ font: 'X' });
  });

  it('turns a disabled site back on when the size changes', () => {
    expect(applyCommand('size-up', { enabled: false }, resolveEffective(global, { enabled: false }))).toEqual({ size: 120 });
  });

  it('recognizes its command names', () => {
    expect(isSiteCommand('size-up')).toBe(true);
    expect(isSiteCommand('_execute_action')).toBe(false);
  });
});

describe('cssFamily', () => {
  it('quotes and escapes', () => {
    expect(cssFamily('Segoe UI')).toBe('"Segoe UI"');
    expect(cssFamily('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});
