/**
 * Editing session over the all-sites defaults and one site's overrides. It
 * turns editor actions into settings changes and saves them in debounced
 * batches, which keeps slider drags under the sync storage write limits.
 */

import {
  DEFAULT_GLOBAL,
  type GlobalSettings,
  type LanguageFont,
  type LocalFace,
  type Profile,
  type ProfileField,
  type SiteSettings,
  pickProfile,
  resolveEffective,
} from '../lib/settings';
import { saveGlobal, saveSite } from '../lib/storage';
import type { EditorActions, EditorState, Scope } from './profile-editor';

const COMMIT_DELAY_MS = 400;

export interface SessionHooks {
  /** Settings changed; re-render. */
  onChange: () => void;
  /** Saving failed. */
  onError: (error: unknown) => void;
}

export class SettingsSession {
  scope: Scope;
  private dirtyGlobal = false;
  private dirtySite = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    readonly site: string | null,
    public global: GlobalSettings,
    public siteSettings: SiteSettings,
    private readonly hooks: SessionHooks,
  ) {
    this.scope = site ? 'site' : 'global';
  }

  /** Whether changes apply on the site (site scope) or the defaults are on (global scope). */
  get enabled(): boolean {
    return this.scope === 'site' ? this.siteSettings.enabled !== false : this.global.enabled;
  }

  /** What the editor shows for the current scope. */
  editorState(): EditorState {
    if (this.scope === 'global') {
      return { scope: 'global', profile: pickProfile(this.global), overridden: () => false, languageOverridden: () => false };
    }
    const site = this.siteSettings;
    return {
      scope: 'site',
      profile: resolveEffective(this.global, site).profile,
      overridden: (field) => site[field] !== undefined,
      languageOverridden: (id) => site.languages?.[id] !== undefined,
    };
  }

  /** Editor actions bound to this session. */
  actions(resolveFaces: (family: string) => Promise<LocalFace[]>): EditorActions {
    return {
      setField: (field, value) => this.setField(field, value),
      resetField: (field) => this.resetField(field),
      setLanguage: (id, font) => this.setLanguage(id, font),
      resetLanguage: (id) => this.resetLanguage(id),
      resolveFaces,
    };
  }

  setScope(scope: Scope): void {
    if (scope === 'site' && !this.site) return;
    this.scope = scope;
    this.hooks.onChange();
  }

  setEnabled(enabled: boolean): void {
    if (this.scope === 'site') {
      const { enabled: _previous, ...rest } = this.siteSettings;
      this.siteSettings = enabled ? rest : { ...rest, enabled: false };
      this.markSite();
    } else {
      this.global = { ...this.global, enabled };
      this.markGlobal();
    }
  }

  /** Clears the site's overrides, or restores the defaults in global scope. */
  resetScope(): void {
    if (this.scope === 'site') {
      this.siteSettings = {};
      this.markSite();
    } else {
      this.global = { ...DEFAULT_GLOBAL, languages: {} };
      this.markGlobal();
    }
  }

  private setField<F extends ProfileField>(field: F, value: Profile[F]): void {
    if (this.scope === 'global') {
      this.global = { ...this.global, [field]: value };
      this.markGlobal();
    } else {
      this.siteSettings = { ...this.siteSettings, [field]: value };
      this.markSite();
    }
  }

  private resetField(field: ProfileField): void {
    const next = { ...this.siteSettings };
    delete next[field];
    this.siteSettings = next;
    this.markSite();
  }

  private setLanguage(id: string, font: LanguageFont | null): void {
    if (this.scope === 'global') {
      const languages = { ...this.global.languages };
      if (font) languages[id] = font;
      else delete languages[id];
      this.global = { ...this.global, languages };
      this.markGlobal();
      return;
    }
    const languages = { ...this.siteSettings.languages };
    if (font) languages[id] = font;
    // Removing a language the defaults provide needs an explicit "none" override.
    else if (this.global.enabled && this.global.languages[id]) languages[id] = null;
    else delete languages[id];
    this.siteSettings = { ...this.siteSettings, languages };
    this.markSite();
  }

  private resetLanguage(id: string): void {
    const languages = { ...this.siteSettings.languages };
    delete languages[id];
    this.siteSettings = { ...this.siteSettings, languages };
    this.markSite();
  }

  private markGlobal(): void {
    this.dirtyGlobal = true;
    this.changed();
  }

  private markSite(): void {
    const languages = this.siteSettings.languages;
    if (languages && !Object.keys(languages).length) {
      const { languages: _empty, ...rest } = this.siteSettings;
      this.siteSettings = rest;
    }
    this.dirtySite = true;
    this.changed();
  }

  private changed(): void {
    this.hooks.onChange();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), COMMIT_DELAY_MS);
  }

  /** Saves pending changes now. */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const saves: Promise<void>[] = [];
    if (this.dirtyGlobal) saves.push(saveGlobal(this.global));
    if (this.dirtySite && this.site) saves.push(saveSite(this.site, this.siteSettings));
    this.dirtyGlobal = false;
    this.dirtySite = false;
    try {
      await Promise.all(saves);
    } catch (error) {
      this.hooks.onError(error);
    }
  }

  /** Replaces the session's settings with stored ones (when another page changed them). */
  replace(global: GlobalSettings, siteSettings: SiteSettings): void {
    if (this.timer !== undefined) return;
    this.global = global;
    this.siteSettings = siteSettings;
    this.hooks.onChange();
  }
}
