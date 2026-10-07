import { type Browser, browser } from 'wxt/browser';
import { probeFaces } from '../../lib/fonts';
import { PREVIEW_PORT, type PreviewMessage } from '../../lib/messages';
import { siteKeyFromUrl } from '../../lib/site';
import { StorageQuotaError, loadSettings } from '../../lib/storage';
import { Segmented, createSwitch } from '../../ui/controls';
import { h, icon, iconButton } from '../../ui/dom';
import { ProfileEditor, type Scope } from '../../ui/profile-editor';
import { SettingsSession } from '../../ui/settings-session';

/** Chrome's own zoom steps, so the popup matches Ctrl +/-. */
const ZOOM_LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

/** The tab to edit: `?tabId=` (used when the popup is opened as a page) or the active tab. */
async function targetTab(): Promise<Browser.tabs.Tab | undefined> {
  const requested = Number(new URLSearchParams(location.search).get('tabId'));
  if (Number.isInteger(requested) && requested > 0) return browser.tabs.get(requested).catch(() => undefined);
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function errorMessage(error: unknown): string {
  if (error instanceof StorageQuotaError) return error.message;
  return `Settings could not be saved: ${error instanceof Error ? error.message : String(error)}`;
}

/** Native page zoom for the tab, shown only in site scope. */
function zoomCard(tabId: number): HTMLElement {
  const output = h('output', { text: '100%', attrs: { 'aria-live': 'off' } });
  let zoom = 1;
  const show = (value: number) => {
    zoom = value;
    output.textContent = `${Math.round(value * 100)}%`;
  };
  const step = (direction: 1 | -1) => {
    const index = ZOOM_LEVELS.findIndex((level) => level >= zoom - 0.001);
    const current = index === -1 ? ZOOM_LEVELS.length - 1 : index;
    const next = ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, current + direction))]!;
    void browser.tabs.setZoom(tabId, next);
  };
  browser.tabs.getZoom(tabId).then(show, () => undefined);
  browser.tabs.onZoomChange.addListener((change) => {
    if (change.tabId === tabId) show(change.newZoomFactor);
  });
  return h(
    'section',
    { class: 'card zoom' },
    h(
      'div',
      { class: 'row' },
      h('span', {
        class: 'field-label',
        text: 'Page zoom',
        title: "The browser's own zoom. It is remembered for this exact host (www. included) and matches Ctrl + and Ctrl -.",
      }),
      h(
        'div',
        { class: 'row' },
        iconButton('minus', 'Zoom out', () => step(-1)),
        output,
        iconButton('plus', 'Zoom in', () => step(1)),
        iconButton('reset', 'Reset zoom to 100%', () => void browser.tabs.setZoom(tabId, 0)),
      ),
    ),
  );
}

async function main(): Promise<void> {
  const app = document.getElementById('app')!;
  const tab = await targetTab();
  const site = siteKeyFromUrl(tab?.url);
  const stored = await loadSettings(site);

  let port: Browser.runtime.Port | undefined;
  const status = h('div', { class: 'status' });
  let saveError: string | null = null;

  const preview = () => {
    if (!site || tab?.id === undefined) return;
    try {
      if (!port) {
        const opened = browser.tabs.connect(tab.id, { name: PREVIEW_PORT });
        opened.onDisconnect.addListener(() => {
          if (port === opened) port = undefined;
        });
        port = opened;
      }
      const message: PreviewMessage = { type: 'preview', global: session.global, site: session.siteSettings };
      port.postMessage(message);
    } catch {
      port = undefined;
    }
  };

  const session = new SettingsSession(site, stored.global, stored.site ?? {}, {
    onChange: () => {
      render();
      preview();
    },
    onError: (error) => {
      saveError = errorMessage(error);
      render();
    },
  });

  const editor = new ProfileEditor(session.actions(probeFaces), { compact: true });
  const scope = new Segmented<Scope>(
    'Settings scope',
    [
      { value: 'site', label: 'This site', title: site ? `Settings for ${site} only` : undefined },
      { value: 'global', label: 'All sites', title: 'Defaults for every site without its own settings' },
    ],
    session.scope,
    (value) => session.setScope(value),
  );
  scope.disable('site', !site, 'Browsers do not let extensions change this page');

  const power = createSwitch('Changes on', session.enabled, (checked) => session.setEnabled(checked));
  const powerText = h('span', { attrs: { 'aria-hidden': 'true' } });
  const siteLabel = h('div', { class: 'site' });
  const header = h(
    'header',
    { class: 'header' },
    h('img', { attrs: { src: '/icon/32.png', alt: '' } }),
    h('div', { class: 'titles' }, h('h1', { text: 'gfg Typeface' }), siteLabel),
    h('label', { class: 'power' }, powerText, power),
  );

  const resetButton = h('button', {
    class: 'btn btn-ghost btn-danger btn-sm',
    attrs: { type: 'button' },
    on: { click: () => session.resetScope() },
  });
  resetButton.prepend(icon('reset'));
  const resetLabel = h('span');
  resetButton.append(resetLabel);
  const settingsButton = h('button', {
    class: 'btn btn-ghost btn-sm',
    attrs: { type: 'button' },
    on: { click: () => void browser.runtime.openOptionsPage().then(() => window.close()) },
  });
  settingsButton.append(icon('settings'), h('span', { text: 'All settings' }));

  const zoom = site && tab?.id !== undefined ? zoomCard(tab.id) : null;
  const zoomSlot = h('div');

  function render(): void {
    const isSite = session.scope === 'site';
    scope.set(session.scope);
    siteLabel.textContent = site ? (isSite ? site : 'Defaults for all sites') : 'Not available on this page';
    power.checked = session.enabled;
    powerText.textContent = session.enabled ? 'On' : 'Off';
    const powerLabel = isSite ? `Change fonts on ${site}` : 'Use the all-sites defaults';
    power.title = powerLabel;
    power.setAttribute('aria-label', powerLabel);

    status.replaceChildren();
    if (!site) {
      status.append(
        h('div', { class: 'notice' }, icon('info'), h('span', { text: 'Browsers do not let extensions change this page. You can still edit the all-sites defaults.' })),
      );
    } else if (!session.enabled) {
      const text = isSite ? `Changes are off on ${site}.` : 'All-sites defaults are paused. Sites with their own settings still use them.';
      status.append(h('div', { class: 'notice' }, icon('power'), h('span', { text })));
    }
    if (saveError) status.append(h('div', { class: 'notice notice-error' }, icon('info'), h('span', { text: saveError })));

    editor.update(session.editorState());
    editor.element.classList.toggle('off', !session.enabled);
    zoomSlot.replaceChildren(isSite && zoom ? zoom : '');
    resetLabel.textContent = isSite ? 'Reset this site' : 'Reset defaults';
    resetButton.title = isSite ? `Remove all settings for ${site}` : 'Restore the original all-sites defaults';
  }

  app.replaceChildren(
    header,
    h('div', { class: 'scope' }, scope.element),
    status,
    editor.element,
    zoomSlot,
    h('footer', { class: 'footer' }, resetButton, settingsButton),
  );
  app.removeAttribute('aria-busy');
  render();

  // Keep pending edits when the popup closes before the debounced save.
  window.addEventListener('pagehide', () => void session.flush());
}

void main();
