/** Minimal DOM building helpers for the extension pages. */

type Child = Node | string | null | undefined | false;

interface Props {
  class?: string;
  text?: string;
  title?: string;
  attrs?: Record<string, string | boolean | number | undefined>;
  style?: Partial<Record<string, string>>;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (event: HTMLElementEventMap[K]) => void }>;
}

/** Creates an element with classes, attributes, listeners and children. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.class) element.className = props.class;
  if (props.text !== undefined) element.textContent = props.text;
  if (props.title) element.title = props.title;
  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    if (value === undefined || value === false) continue;
    element.setAttribute(name, value === true ? '' : String(value));
  }
  for (const [name, value] of Object.entries(props.style ?? {})) {
    if (value !== undefined) element.style.setProperty(name, value);
  }
  for (const [type, listener] of Object.entries(props.on ?? {})) {
    element.addEventListener(type, listener as EventListener);
  }
  for (const child of children) if (child) element.append(child);
  return element;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Icon paths (24x24, stroke based). */
export const ICONS = {
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  chevron: 'm9 18 6-6-6-6',
  close: 'M18 6 6 18M6 6l12 12',
  search: 'm21 21-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01',
  check: 'm5 12 5 5L20 7',
  upload: 'M12 15V3M7 8l5-5 5 5M5 21h14',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  keyboard: 'M2 6h20v12H2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8',
  zoom: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM21 21l-4.3-4.3M8 11h6M11 8v6',
  power: 'M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0',
} as const;

/** Creates an inline SVG icon. */
export function icon(name: keyof typeof ICONS, className = 'icon'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

/** Creates an icon-only button with an accessible name and tooltip. */
export function iconButton(name: keyof typeof ICONS, label: string, onClick: () => void, className = 'btn btn-ghost btn-icon btn-sm'): HTMLButtonElement {
  const button = h('button', { class: className, title: label, attrs: { type: 'button', 'aria-label': label }, on: { click: onClick } });
  button.append(icon(name));
  return button;
}
