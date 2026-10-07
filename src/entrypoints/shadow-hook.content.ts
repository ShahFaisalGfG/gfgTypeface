import { defineContentScript } from 'wxt/utils/define-content-script';
import { SHADOW_EVENT } from '../lib/hook-events';

/**
 * Runs in the page's own world to report shadow roots attached to hosts that are
 * already in the document: content scripts can't observe `attachShadow` calls, and
 * looking up closed roots on every element would be too slow.
 */
function installHook(): void {
  const marker = Symbol.for('gfg-typeface.shadow-hook');
  const prototype = Element.prototype as Element & { [key: symbol]: unknown };
  if (prototype[marker]) return;

  const original = prototype.attachShadow;
  // A method shorthand keeps the wrapper's name and non-constructible shape native-like.
  const wrapper = {
    attachShadow(this: Element, init: ShadowRootInit): ShadowRoot {
      const root = original.call(this, init);
      if (this.isConnected) this.dispatchEvent(new Event(SHADOW_EVENT, { composed: true }));
      return root;
    },
  }.attachShadow;

  Object.defineProperty(prototype, 'attachShadow', { value: wrapper, writable: true, configurable: true, enumerable: true });
  Object.defineProperty(prototype, marker, { value: true });
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,
  matchAboutBlank: true,
  matchOriginAsFallback: true,
  world: 'MAIN',
  noScriptStartedPostMessage: true,
  main: installHook,
});
