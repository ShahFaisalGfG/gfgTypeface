/**
 * Editor for one profile (all-sites defaults or one site's settings), shared
 * by the popup and the options page. It renders once and updates in place, so
 * sliders keep working while the user drags them.
 */

import { cssFamily } from '../lib/fonts';
import { LANGUAGES, type Language, getLanguage } from '../lib/languages';
import { LIMITS, type LanguageFont, type LocalFace, type Profile, type ProfileField } from '../lib/settings';
import { Slider, createSwitch } from './controls';
import { h, icon, iconButton } from './dom';
import { FontPicker } from './font-picker';

export type Scope = 'site' | 'global';

export interface EditorState {
  scope: Scope;
  /** Values to show: the effective profile in site scope, the defaults in global scope. */
  profile: Profile;
  /** Site scope: whether the site overrides a field. */
  overridden: (field: ProfileField) => boolean;
  /** Site scope: whether the site overrides one language. */
  languageOverridden: (id: string) => boolean;
}

export interface EditorActions {
  setField: <F extends ProfileField>(field: F, value: Profile[F]) => void;
  /** Site scope: drop the override so the all-sites default applies. */
  resetField: (field: ProfileField) => void;
  /** Sets a language font, or removes the language with `null`. */
  setLanguage: (id: string, font: LanguageFont | null) => void;
  /** Site scope: drop the language override. */
  resetLanguage: (id: string) => void;
  /** Finds `local()` face names for a family. */
  resolveFaces: (family: string) => Promise<LocalFace[]>;
}

export interface EditorOptions {
  /** Popup layout: secondary settings go in a collapsible section. */
  compact: boolean;
}

const OPEN_KEY_PREFIX = 'gfg-typeface.open.';

function percent(value: number): string {
  return `${value}%`;
}

function weightLabel(value: number): string {
  if (value === 0) return 'Normal';
  return value > 0 ? `+${value}` : String(value);
}

/** A collapsible section whose open state is remembered per key. */
function disclosure(key: string, summary: Node[], ...content: Node[]): HTMLDetailsElement {
  const details = h('details', { class: 'more' }, h('summary', {}, icon('chevron', 'icon chevron'), ...summary), ...content);
  details.open = localStorage.getItem(OPEN_KEY_PREFIX + key) === '1';
  details.addEventListener('toggle', () => localStorage.setItem(OPEN_KEY_PREFIX + key, details.open ? '1' : '0'));
  return details;
}

/** A labeled field: label, status (badges and reset), control and an optional hint. */
function fieldBlock(label: string, status: HTMLElement, control: HTMLElement, hint?: string): HTMLElement {
  const head = h('div', { class: 'field-head' }, h('span', { class: 'field-label', text: label }), h('span', { class: 'spacer' }), status);
  return h('div', { class: 'field' }, head, control, hint ? h('div', { class: 'field-hint', text: hint }) : null);
}

interface OverrideLabels {
  /** Badge when the value is set here, e.g. "This site". */
  set: string;
  /** Tooltip of the "Default" badge: where the value comes from. */
  inherited: string;
  /** Tooltip of the reset button. */
  reset: string;
}

/** Shows whether a value is set here (badge and reset button) or inherited ("Default"). */
function renderOverride(status: HTMLElement, overridden: boolean, labels: OverrideLabels, onReset: () => void): void {
  status.replaceChildren();
  if (overridden) {
    status.append(h('span', { class: 'badge badge-accent', text: labels.set }), iconButton('reset', labels.reset, onReset));
  } else {
    status.append(h('span', { class: 'badge', text: 'Default', title: labels.inherited }));
  }
}

const SITE_LABELS: OverrideLabels = {
  set: 'This site',
  inherited: 'Comes from the all-sites defaults',
  reset: 'Use the all-sites default',
};

export class ProfileEditor {
  readonly element: HTMLElement;
  private state!: EditorState;
  private readonly fieldStatus = new Map<ProfileField, HTMLElement>();
  private readonly fontPicker: FontPicker;
  private readonly codePicker: FontPicker;
  private readonly matchSwitch: HTMLInputElement;
  private readonly size: Slider;
  private readonly spacing: Slider;
  private readonly weight: Slider;
  private readonly languageList: HTMLElement;
  private readonly languageAdd: HTMLSelectElement;
  private readonly languageRows = new Map<string, LanguageRow>();
  private readonly pendingLanguages = new Set<string>();

  constructor(
    private readonly actions: EditorActions,
    options: EditorOptions,
  ) {
    this.fontPicker = new FontPicker({
      label: 'Font',
      noneLabel: "Site's own fonts",
      value: null,
      onChange: (value) => actions.setField('font', value),
    });
    this.matchSwitch = createSwitch('Match original size', true, (checked) => actions.setField('matchSize', checked));
    this.size = new Slider({ label: 'Text size', ...LIMITS.size, value: 100, format: percent, onInput: (value) => actions.setField('size', value) });
    this.spacing = new Slider({
      label: 'Line spacing',
      ...LIMITS.lineSpacing,
      value: 100,
      format: percent,
      onInput: (value) => actions.setField('lineSpacing', value),
    });
    this.weight = new Slider({ label: 'Weight', ...LIMITS.weight, value: 0, format: weightLabel, onInput: (value) => actions.setField('weight', value) });
    this.codePicker = new FontPicker({
      label: 'Code font',
      noneLabel: "Site's own code font",
      value: null,
      onChange: (value) => actions.setField('codeFont', value),
    });

    const fontField = this.field('font', 'Font', this.fontPicker.element);
    const matchRow = h(
      'label',
      { class: 'row field-hint', title: 'Sizes a replacement font so its lowercase letters match the height of the font it replaces' },
      this.matchSwitch,
      h('span', { text: 'Match the original text size' }),
    );
    fontField.append(matchRow);

    const sizeField = this.field('size', 'Text size', this.size.element, 'Relative to each site’s own sizes');
    const spacingField = this.field('lineSpacing', 'Line spacing', this.spacing.element);
    const weightField = this.field('weight', 'Weight', this.weight.element, 'Depends on the weights a font provides');
    const codeField = this.field('codeFont', 'Code font', this.codePicker.element, 'Used for code blocks and monospace text');

    this.languageList = h('div', { class: 'language-list' });
    this.languageAdd = h('select', {
      class: 'select',
      attrs: { 'aria-label': 'Add a language font' },
      on: { change: () => this.addLanguage() },
    });
    const languageField = this.field(
      'languages',
      'Language fonts',
      h('div', { class: 'field' }, this.languageList, this.languageAdd),
      'Each language gets its own font, even inside text in another language',
    );

    const primary = h('section', { class: 'card' }, fontField, sizeField);
    const secondaryFields = [spacingField, weightField, codeField, languageField];

    if (options.compact) {
      const more = disclosure('more', [h('span', { text: 'More options' })], ...secondaryFields);
      this.element = h('div', { class: 'editor' }, primary, h('section', { class: 'card' }, more));
    } else {
      this.element = h(
        'div',
        { class: 'editor' },
        primary,
        h('section', { class: 'card' }, spacingField, weightField),
        h('section', { class: 'card' }, codeField, languageField),
      );
    }
  }

  private field(name: ProfileField, label: string, control: HTMLElement, hint?: string): HTMLElement {
    const status = h('span', { class: 'row' });
    this.fieldStatus.set(name, status);
    return fieldBlock(label, status, control, hint);
  }

  /** Shows a new state. */
  update(state: EditorState): void {
    this.state = state;
    const { profile } = state;
    this.fontPicker.set(profile.font);
    this.codePicker.set(profile.codeFont);
    this.matchSwitch.checked = profile.matchSize;
    this.matchSwitch.disabled = profile.font === null && profile.codeFont === null;
    this.size.set(profile.size);
    this.spacing.set(profile.lineSpacing);
    this.weight.set(profile.weight);
    for (const [field, status] of this.fieldStatus) this.renderStatus(field, status);
    this.renderLanguages();
  }

  private renderStatus(field: ProfileField, status: HTMLElement): void {
    if (this.state.scope !== 'site' || field === 'languages') {
      status.replaceChildren();
      return;
    }
    renderOverride(status, this.state.overridden(field), SITE_LABELS, () => this.actions.resetField(field));
  }

  private renderLanguages(): void {
    const configured = Object.keys(this.state.profile.languages);
    for (const id of configured) this.pendingLanguages.delete(id);
    const shown = [...configured, ...this.pendingLanguages];

    for (const [id, row] of this.languageRows) {
      if (!shown.includes(id)) {
        row.element.remove();
        this.languageRows.delete(id);
      }
    }
    for (const id of shown) {
      const language = getLanguage(id);
      if (!language) continue;
      let row = this.languageRows.get(id);
      if (!row) {
        row = new LanguageRow(language, this.actions, () => {
          this.pendingLanguages.delete(id);
          this.renderLanguages();
        });
        this.languageRows.set(id, row);
      }
      this.languageList.append(row.element);
      row.update(this.state.profile.languages[id] ?? null, this.state.scope === 'site' && this.state.languageOverridden(id), this.state.profile);
    }

    this.languageAdd.replaceChildren(h('option', { text: 'Add a language font…', attrs: { value: '' } }));
    for (const language of LANGUAGES) {
      if (shown.includes(language.id)) continue;
      this.languageAdd.append(h('option', { text: `${language.label} · ${language.nativeLabel}`, attrs: { value: language.id } }));
    }
    this.languageAdd.value = '';
  }

  private addLanguage(): void {
    const id = this.languageAdd.value;
    if (!id) return;
    this.pendingLanguages.add(id);
    this.renderLanguages();
    this.languageRows.get(id)?.focusPicker();
  }
}

type LanguageSetting = 'lineSpacing' | 'weight';

/**
 * One configured language: font, size and a sample in that language, plus an
 * Advanced section for line spacing and weight that otherwise follow the profile.
 */
class LanguageRow {
  readonly element: HTMLElement;
  private readonly picker: FontPicker;
  private readonly size: Slider;
  private readonly spacing: Slider;
  private readonly weight: Slider;
  private readonly spacingStatus = h('span', { class: 'row' });
  private readonly weightStatus = h('span', { class: 'row' });
  private readonly advancedNote = h('span', { class: 'field-hint' });
  private readonly sample: HTMLElement;
  private readonly status: HTMLElement;
  private readonly notice: HTMLElement;
  private font: LanguageFont | null = null;

  constructor(
    private readonly language: Language,
    private readonly actions: EditorActions,
    private readonly onRemovePending: () => void,
  ) {
    this.picker = new FontPicker({
      label: `${language.label} font`,
      noneLabel: 'Choose a font',
      value: null,
      onChange: (family) => void this.choose(family),
    });
    this.size = new Slider({
      label: `${language.label} text size`,
      ...LIMITS.languageSize,
      value: 100,
      format: percent,
      onInput: (value) => {
        if (this.font) this.actions.setLanguage(language.id, { ...this.font, size: value });
      },
    });
    this.spacing = new Slider({
      label: `${language.label} line spacing`,
      ...LIMITS.lineSpacing,
      value: 100,
      format: percent,
      onInput: (value) => this.setSetting('lineSpacing', value),
    });
    this.weight = new Slider({
      label: `${language.label} weight`,
      ...LIMITS.weight,
      value: 0,
      format: weightLabel,
      onInput: (value) => this.setSetting('weight', value),
    });
    const advanced = disclosure(
      `language.${language.id}`,
      [h('span', { text: 'Advanced' }), this.advancedNote],
      fieldBlock('Line spacing', this.spacingStatus, this.spacing.element),
      fieldBlock('Weight', this.weightStatus, this.weight.element),
    );
    advanced.classList.add('language-advanced');
    this.sample = h('div', { class: 'language-sample', text: language.sample, attrs: { lang: language.id, dir: 'auto' } });
    this.status = h('span', { class: 'row' });
    this.notice = h('div');
    this.element = h(
      'div',
      { class: 'language-row' },
      h(
        'div',
        { class: 'field-head' },
        h('span', { class: 'field-label', text: language.label }),
        h('span', { class: 'field-hint', text: language.nativeLabel, attrs: { lang: language.id } }),
        h('span', { class: 'spacer' }),
        this.status,
        iconButton('trash', `Remove the ${language.label} font`, () => this.remove()),
      ),
      this.picker.element,
      this.sample,
      this.size.element,
      advanced,
      this.notice,
    );
  }

  /** Shows a language's settings; `profile` supplies the values its Advanced settings follow by default. */
  update(font: LanguageFont | null, overridden: boolean, profile: Profile): void {
    this.font = font;
    this.picker.set(font?.family ?? null);
    this.size.set(font?.size ?? 100);
    const spacing = font?.lineSpacing ?? profile.lineSpacing;
    const weight = font?.weight ?? profile.weight;
    this.spacing.set(spacing);
    this.weight.set(weight);
    const labels = (setting: string): OverrideLabels => ({
      set: this.language.label,
      inherited: `Follows the ${setting} setting above`,
      reset: `Use the ${setting} setting above`,
    });
    renderOverride(this.spacingStatus, font?.lineSpacing !== undefined, labels('Line spacing'), () => this.setSetting('lineSpacing', undefined));
    renderOverride(this.weightStatus, font?.weight !== undefined, labels('Weight'), () => this.setSetting('weight', undefined));
    const notes = [
      font?.lineSpacing !== undefined ? `Line spacing ${percent(font.lineSpacing)}` : '',
      font?.weight !== undefined ? `Weight ${weightLabel(font.weight)}` : '',
    ].filter(Boolean);
    this.advancedNote.textContent = notes.length ? `\u00b7 ${notes.join(', ')}` : '';
    this.sample.style.fontFamily = font ? `${cssFamily(font.family)}, var(--font-ui)` : '';
    this.sample.style.fontSize = `${18 * ((font?.size ?? 100) / 100)}px`;
    this.sample.style.fontWeight = String(Math.min(1000, Math.max(1, 400 + weight)));
    this.status.replaceChildren();
    if (overridden) {
      this.status.append(iconButton('reset', 'Use the all-sites default', () => this.actions.resetLanguage(this.language.id)));
    }
    this.notice.replaceChildren();
    if (font && !font.faces.length) {
      this.notice.append(
        h(
          'div',
          { class: 'notice' },
          icon('info'),
          h('span', {
            text: `This font's faces could not be identified, so it only applies where the main font has no ${this.language.label} letters.`,
          }),
        ),
      );
    }
  }

  focusPicker(): void {
    this.picker.element.querySelector('button')?.focus();
  }

  private async choose(family: string | null): Promise<void> {
    if (family === null) return;
    const faces = await this.actions.resolveFaces(family);
    // Keep the language's other settings when only its font changes.
    this.actions.setLanguage(this.language.id, { size: 100, ...this.font, family, faces });
  }

  /** Sets one Advanced setting, or makes it follow the profile again with `undefined`. */
  private setSetting(setting: LanguageSetting, value: number | undefined): void {
    if (!this.font) return;
    const font: LanguageFont = { ...this.font };
    if (value === undefined) delete font[setting];
    else font[setting] = value;
    this.actions.setLanguage(this.language.id, font);
  }

  private remove(): void {
    if (this.font) this.actions.setLanguage(this.language.id, null);
    else this.onRemovePending();
  }
}
