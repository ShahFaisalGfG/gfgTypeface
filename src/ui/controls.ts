/** Slider, switch and segmented controls shared by the popup and options page. */

import { h, iconButton } from './dom';

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (value: number) => string;
  /** Called on every change, including while dragging. */
  onInput: (value: number) => void;
}

/** Range slider with -/+ steppers and a formatted value. */
export class Slider {
  readonly element: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly output: HTMLOutputElement;

  constructor(private readonly options: SliderOptions) {
    this.input = h('input', {
      attrs: {
        type: 'range',
        min: options.min,
        max: options.max,
        step: options.step,
        'aria-label': options.label,
      },
      on: { input: () => this.emit(Number(this.input.value)) },
    });
    this.output = h('output', { attrs: { 'aria-hidden': 'true' } });
    this.element = h(
      'div',
      { class: 'slider' },
      iconButton('minus', `Decrease ${options.label.toLowerCase()}`, () => this.emit(Number(this.input.value) - options.step)),
      this.input,
      iconButton('plus', `Increase ${options.label.toLowerCase()}`, () => this.emit(Number(this.input.value) + options.step)),
      this.output,
    );
    this.set(options.value);
  }

  /** Updates the shown value without firing `onInput`. */
  set(value: number): void {
    this.input.value = String(value);
    const text = this.options.format(value);
    this.output.textContent = text;
    this.input.setAttribute('aria-valuetext', text);
    const fill = ((value - this.options.min) / (this.options.max - this.options.min)) * 100;
    this.input.style.setProperty('--fill', `${fill}%`);
  }

  private emit(value: number): void {
    const clamped = Math.min(this.options.max, Math.max(this.options.min, value));
    this.set(clamped);
    this.options.onInput(clamped);
  }
}

/** Creates a switch (`input[role=switch]`) with an accessible name. */
export function createSwitch(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLInputElement {
  return h('input', {
    class: 'switch',
    title: label,
    attrs: { type: 'checkbox', role: 'switch', 'aria-label': label, checked },
    on: { change: (event) => onChange((event.target as HTMLInputElement).checked) },
  });
}

/** Segmented control of mutually exclusive buttons. */
export class Segmented<T extends string> {
  readonly element: HTMLElement;
  private readonly buttons = new Map<T, HTMLButtonElement>();

  constructor(label: string, choices: readonly { value: T; label: string; title?: string }[], value: T, onChange: (value: T) => void) {
    this.element = h('div', { class: 'segmented', attrs: { role: 'group', 'aria-label': label } });
    for (const choice of choices) {
      const button = h('button', {
        text: choice.label,
        title: choice.title,
        attrs: { type: 'button' },
        on: {
          click: () => {
            this.set(choice.value);
            onChange(choice.value);
          },
        },
      });
      this.buttons.set(choice.value, button);
      this.element.append(button);
    }
    this.set(value);
  }

  set(value: T): void {
    for (const [choice, button] of this.buttons) button.setAttribute('aria-pressed', String(choice === value));
  }

  disable(value: T, disabled: boolean, reason?: string): void {
    const button = this.buttons.get(value);
    if (!button) return;
    button.disabled = disabled;
    button.title = disabled && reason ? reason : '';
  }
}
