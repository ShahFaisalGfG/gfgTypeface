/**
 * Searchable font picker. Each option is drawn in its own font; the list is
 * virtualized because systems often have hundreds of fonts.
 */

import { type InstalledFont, cssFamily, getInstalledFonts } from '../lib/fonts';
import { h, icon } from './dom';

const ROW_HEIGHT = 34;
const OVERSCAN = 6;
const MAX_LIST_HEIGHT = 260;

let pickerCount = 0;

export interface FontPickerOptions {
  /** Accessible name of the picker. */
  label: string;
  /** Label for the `null` choice, e.g. "Site's own font". */
  noneLabel: string;
  value: string | null;
  onChange: (value: string | null) => void;
}

interface Row {
  value: string | null;
  label: string;
}

/** A button that opens a searchable list of installed fonts. */
export class FontPicker {
  readonly element: HTMLElement;
  private value: string | null;
  private readonly button: HTMLButtonElement;
  private readonly valueLabel: HTMLSpanElement;
  private readonly popover: HTMLDivElement;
  private readonly search: HTMLInputElement;
  private readonly list: HTMLDivElement;
  private readonly spacer: HTMLDivElement;
  private readonly id = `font-picker-${++pickerCount}`;
  private fonts: InstalledFont[] = [];
  private rows: Row[] = [];
  private active = 0;

  constructor(private readonly options: FontPickerOptions) {
    this.value = options.value;
    this.valueLabel = h('span', { class: 'picker-value' });
    this.button = h(
      'button',
      {
        class: 'picker-button',
        attrs: { type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': options.label },
        on: { click: () => this.open() },
      },
      this.valueLabel,
      icon('chevron'),
    );
    this.button.lastElementChild?.setAttribute('style', 'transform: rotate(90deg); color: var(--text-muted)');

    this.search = h('input', {
      attrs: {
        type: 'search',
        placeholder: 'Search fonts',
        role: 'combobox',
        'aria-autocomplete': 'list',
        'aria-expanded': 'true',
        'aria-controls': `${this.id}-list`,
        'aria-label': `Search fonts for ${options.label}`,
        spellcheck: 'false',
        autocomplete: 'off',
      },
      on: { input: () => this.filter(), keydown: (event) => this.onKey(event) },
    });
    this.spacer = h('div', { attrs: { 'aria-hidden': 'true' } });
    this.list = h('div', {
      class: 'picker-list',
      attrs: { id: `${this.id}-list`, role: 'listbox', 'aria-label': options.label, tabindex: '-1' },
      on: { scroll: () => this.renderRows() },
    });
    this.list.append(this.spacer);
    this.popover = h(
      'div',
      { class: 'picker-popover', attrs: { popover: 'auto' } },
      h('div', { class: 'picker-search' }, icon('search'), this.search),
      this.list,
    );
    this.popover.addEventListener('toggle', (event) => {
      const open = (event as ToggleEvent).newState === 'open';
      this.button.setAttribute('aria-expanded', String(open));
      if (!open && document.activeElement === document.body) this.button.focus();
    });

    this.element = h('div', { class: 'font-picker' }, this.button, this.popover);
    this.renderValue();
  }

  /** Updates the selected font without firing `onChange`. */
  set(value: string | null): void {
    this.value = value;
    this.renderValue();
  }

  private renderValue(): void {
    this.valueLabel.replaceChildren();
    if (this.value === null) {
      this.valueLabel.append(h('span', { class: 'placeholder', text: this.options.noneLabel }));
      this.valueLabel.style.fontFamily = '';
    } else {
      this.valueLabel.textContent = this.value;
      this.valueLabel.style.fontFamily = `${cssFamily(this.value)}, var(--font-ui)`;
    }
  }

  private async open(): Promise<void> {
    this.fonts = await getInstalledFonts();
    this.search.value = '';
    this.filter();
    this.position();
    this.popover.showPopover();
    this.search.focus();
    const selected = this.rows.findIndex((row) => row.value === this.value);
    this.setActive(Math.max(0, selected), 'center');
  }

  private position(): void {
    const rect = this.button.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const searchHeight = 45;
    const room = Math.max(below, above) - searchHeight;
    const listHeight = Math.max(ROW_HEIGHT * 3, Math.min(MAX_LIST_HEIGHT, room));
    const width = Math.min(Math.max(rect.width, 260), window.innerWidth - 16);
    this.popover.style.setProperty('--picker-width', `${width}px`);
    this.popover.style.setProperty('--picker-list-height', `${listHeight}px`);
    this.popover.style.left = `${Math.min(rect.left, window.innerWidth - width - 8)}px`;
    if (below >= listHeight + searchHeight || below >= above) {
      this.popover.style.top = `${rect.bottom + 4}px`;
      this.popover.style.bottom = 'auto';
    } else {
      this.popover.style.top = 'auto';
      this.popover.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    }
  }

  private filter(): void {
    const query = this.search.value.trim().toLowerCase();
    const matches = this.fonts
      .filter((font) => !query || font.label.toLowerCase().includes(query) || font.family.toLowerCase().includes(query))
      .map((font) => ({ value: font.family, label: font.label }));
    this.rows = query ? matches : [{ value: null, label: this.options.noneLabel }, ...matches];
    this.spacer.style.height = `${this.rows.length * ROW_HEIGHT}px`;
    this.list.scrollTop = 0;
    this.active = 0;
    this.renderRows();
  }

  private renderRows(): void {
    for (const child of [...this.list.children]) if (child !== this.spacer) child.remove();
    if (!this.rows.length) {
      this.list.append(h('div', { class: 'picker-empty', text: 'No fonts match your search' }));
      this.search.removeAttribute('aria-activedescendant');
      return;
    }
    const first = Math.max(0, Math.floor(this.list.scrollTop / ROW_HEIGHT) - OVERSCAN);
    const last = Math.min(this.rows.length, Math.ceil((this.list.scrollTop + this.list.clientHeight) / ROW_HEIGHT) + OVERSCAN);
    for (let index = first; index < last; index++) {
      const row = this.rows[index]!;
      const option = h(
        'div',
        {
          class: `picker-option${index === this.active ? ' active' : ''}`,
          attrs: { id: `${this.id}-${index}`, role: 'option', 'aria-selected': String(row.value === this.value) },
          style: { top: `${index * ROW_HEIGHT}px` },
          on: {
            click: () => this.choose(row),
            pointermove: () => {
              if (this.active !== index) this.setActive(index);
            },
          },
        },
        h('span', {
          class: 'name',
          text: row.label,
          style: { 'font-family': row.value === null ? 'var(--font-ui)' : `${cssFamily(row.value)}, var(--font-ui)` },
        }),
        row.value === this.value ? icon('check') : null,
      );
      this.list.append(option);
    }
    this.search.setAttribute('aria-activedescendant', `${this.id}-${this.active}`);
  }

  private setActive(index: number, align: 'nearest' | 'center' = 'nearest'): void {
    this.active = Math.min(Math.max(index, 0), this.rows.length - 1);
    const top = this.active * ROW_HEIGHT;
    const height = this.list.clientHeight || MAX_LIST_HEIGHT;
    if (align === 'center') this.list.scrollTop = top - height / 2 + ROW_HEIGHT / 2;
    else if (top < this.list.scrollTop) this.list.scrollTop = top;
    else if (top + ROW_HEIGHT > this.list.scrollTop + height) this.list.scrollTop = top + ROW_HEIGHT - height;
    this.renderRows();
  }

  private onKey(event: KeyboardEvent): void {
    const page = Math.max(1, Math.floor(this.list.clientHeight / ROW_HEIGHT) - 1);
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page };
    if (event.key in moves) {
      event.preventDefault();
      this.setActive(this.active + moves[event.key]!);
    } else if (event.key === 'Home' && event.ctrlKey) {
      event.preventDefault();
      this.setActive(0);
    } else if (event.key === 'End' && event.ctrlKey) {
      event.preventDefault();
      this.setActive(this.rows.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = this.rows[this.active];
      if (row) this.choose(row);
    }
  }

  private choose(row: Row): void {
    this.popover.hidePopover();
    this.button.focus();
    if (row.value === this.value) return;
    this.value = row.value;
    this.renderValue();
    this.options.onChange(row.value);
  }
}
