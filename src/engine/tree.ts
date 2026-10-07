/** Flat-tree traversal: light DOM, open and closed shadow roots, and slots. */

/** Elements that render no text of their own or that run their own engine (frames). */
const SKIPPED = new Set([
  'AREA',
  'AUDIO',
  'BASE',
  'BR',
  'CANVAS',
  'EMBED',
  'FRAME',
  'FRAMESET',
  'GFC-PROBE',
  'HEAD',
  'IFRAME',
  'IMG',
  'LINK',
  'MAP',
  'META',
  'NOSCRIPT',
  'OBJECT',
  'PARAM',
  'PICTURE',
  'SCRIPT',
  'SOURCE',
  'STYLE',
  'TEMPLATE',
  'TITLE',
  'TRACK',
  'VIDEO',
  'WBR',
]);

const HTML_NS = 'http://www.w3.org/1999/xhtml';

/** True for elements the engine never reads or tags (with their subtrees). */
export function isSkipped(element: Element): boolean {
  return element.namespaceURI !== HTML_NS || SKIPPED.has(element.tagName);
}

interface ChromeDom {
  openOrClosedShadowRoot(element: Element): ShadowRoot | null;
}

const chromeDom = (globalThis as { chrome?: { dom?: ChromeDom } }).chrome?.dom;

/** Shadow roots found so far, including closed ones, keyed by host. */
const knownRoots = new WeakMap<Element, ShadowRoot>();
/** Hosts the MAIN-world hook reported, which may hold closed roots. */
const reportedHosts = new WeakSet<Element>();

/** Records a host that attached a shadow root after it was connected. */
export function markHost(element: Element): void {
  reportedHosts.add(element);
}

/**
 * Returns an element's shadow root, including closed roots (content scripts only).
 * Closed roots are looked up for custom elements and reported hosts only: the lookup
 * is an extension API call, too costly to make for every element.
 */
export function shadowRootOf(element: Element): ShadowRoot | null {
  if (element.shadowRoot) return element.shadowRoot;
  const known = knownRoots.get(element);
  if (known) return known;
  if (!element.localName.includes('-') && !reportedHosts.has(element)) return null;
  let root: ShadowRoot | null;
  try {
    root = chromeDom?.openOrClosedShadowRoot(element) ?? null;
  } catch {
    // Elements in documents without a browsing context can't be queried.
    return null;
  }
  if (root) knownRoots.set(element, root);
  return root;
}

/** Shadow root of a host already seen by `shadowRootOf`, without another API call. */
function cachedRoot(element: Element): ShadowRoot | null {
  return element.shadowRoot ?? knownRoots.get(element) ?? null;
}

function assignedSlot(element: Element): HTMLSlotElement | null {
  if (element.assignedSlot) return element.assignedSlot;
  const host = element.parentElement;
  const root = host && !host.shadowRoot ? cachedRoot(host) : null;
  if (!root) return null;
  // Closed roots hide `assignedSlot`; search the root's slots instead.
  for (const slot of root.querySelectorAll('slot')) {
    if (slot.assignedElements().includes(element)) return slot;
  }
  return null;
}

/** The element `element` inherits styles from in the flat tree, or `null` for the root. */
export function flatParent(element: Element): Element | null {
  const parent = element.parentNode;
  if (!parent) return null;
  if (parent instanceof ShadowRoot) return parent.host;
  if (!(parent instanceof Element)) return null;
  if (cachedRoot(parent)) return assignedSlot(element) ?? parent;
  return parent;
}

const EDITING_HOST = '[contenteditable]:not([contenteditable="false"])';

/**
 * True for an editing host: its descendants are user content, where tags would end up
 * in saved documents and sent emails. Attribute based, because `isContentEditable`
 * forces a style recalculation.
 */
export function isEditingHost(element: Element): boolean {
  return element.matches(EDITING_HOST) || (element.ownerDocument.designMode === 'on' && element.localName === 'body');
}

/** True when `element` sits inside an editable region below its editing host. */
export function isEditableContent(element: Element): boolean {
  const parent = element.parentElement;
  if (!parent) return false;
  return parent.closest(EDITING_HOST) !== null || (element.ownerDocument.designMode === 'on' && parent.localName !== 'html');
}

/**
 * True when `element` is skipped or sits where the engine never works: in `<head>`,
 * inert templates, or inside editable content. Descendants of SVG and MathML are
 * skipped through their namespace. Uses no style reads because it runs for every
 * inserted node.
 */
export function isInSkippedSubtree(element: Element): boolean {
  if (isSkipped(element) || isEditableContent(element)) return true;
  return element.closest('head, template, noscript') !== null;
}

/**
 * Collects elements of the subtrees under `roots` in flat-tree order (parents
 * first), stopping after `limit` elements. Unvisited subtrees are returned as
 * `rest`, so a caller can continue in the next frame. `onShadowRoot` is called
 * for every shadow root met on the way. Elements for which `done` returns true
 * are skipped with their subtrees: their children were collected when they were.
 */
export function collect(
  roots: Element[],
  limit: number,
  onShadowRoot: (root: ShadowRoot) => void,
  done: (element: Element) => boolean = () => false,
): { elements: Element[]; rest: Element[] } {
  const elements: Element[] = [];
  const visited = new Set<Element>();
  const stack = [...roots].reverse();
  while (stack.length) {
    if (elements.length >= limit) return { elements, rest: stack.reverse().filter((element) => !visited.has(element)) };
    const element = stack.pop()!;
    if (visited.has(element) || isSkipped(element) || done(element)) continue;
    visited.add(element);
    elements.push(element);
    if (isEditingHost(element)) continue;

    const children = element.children;
    for (let index = children.length - 1; index >= 0; index--) stack.push(children[index]!);
    const shadow = shadowRootOf(element);
    if (shadow) {
      onShadowRoot(shadow);
      // Shadow children go on top so slots are processed before the light children they host.
      const shadowChildren = shadow.children;
      for (let index = shadowChildren.length - 1; index >= 0; index--) stack.push(shadowChildren[index]!);
    }
  }
  return { elements, rest: [] };
}
