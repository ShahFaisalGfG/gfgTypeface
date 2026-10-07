import { browser } from 'wxt/browser';
import { canQueryLocalFonts, probeFaces, queryFaces } from '../../lib/fonts';
import type { LocalFace } from '../../lib/settings';
import {
  StorageQuotaError,
  exportSettings,
  importSettings,
  loadAllSites,
  loadSettings,
  removeSite,
  resetAll,
  watchSettings,
} from '../../lib/storage';
import { createSwitch } from '../../ui/controls';
import { h, icon } from '../../ui/dom';
import { ProfileEditor } from '../../ui/profile-editor';
import { SettingsSession } from '../../ui/settings-session';

/** Exact faces via the Local Font Access API when allowed, name probing otherwise. */
async function resolveFaces(family: string): Promise<LocalFace[]> {
  if (canQueryLocalFonts()) {
    try {
      const faces = await queryFaces(family);
      if (faces.length) return faces;
    } catch {
      // Permission denied or unavailable; fall back to probing names.
    }
  }
  return probeFaces(family);
}

function errorMessage(error: unknown): string {
  if (error instanceof StorageQuotaError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

/** Shows a modal confirmation and resolves with the user's choice. */
function confirmAction(title: string, body: string, action: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = h(
      'dialog',
      { class: 'card', style: { 'max-width': '420px', padding: '20px' } },
      h('h2', { text: title, style: { margin: '0 0 8px', font: '650 16px/1.3 var(--font-display)' } }),
      h('p', { text: body, style: { margin: '0 0 16px', color: 'var(--text-muted)' } }),
    );
    const cancel = h('button', { class: 'btn', text: 'Cancel', attrs: { type: 'button' }, on: { click: () => dialog.close('cancel') } });
    const confirm = h('button', { class: 'btn btn-primary', text: action, attrs: { type: 'button' }, on: { click: () => dialog.close('ok') } });
    dialog.append(h('div', { class: 'row', style: { 'justify-content': 'flex-end' } }, cancel, confirm));
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok');
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}

function textButton(iconName: Parameters<typeof icon>[0], label: string, onClick: () => void, extra = ''): HTMLButtonElement {
  const button = h('button', { class: `btn ${extra}`.trim(), title: label, attrs: { type: 'button' }, on: { click: onClick } });
  button.append(icon(iconName), h('span', { text: label }));
  return button;
}

async function main(): Promise<void> {
  const app = document.getElementById('app')!;
  let sites = await loadAllSites();
  let selected: string | null = new URLSearchParams(location.hash.slice(1)).get('site');
  if (selected && !sites.has(selected)) selected = null;

  const status = h('div', { class: 'status' });
  let message: { text: string; error: boolean } | null = null;

  const showMessage = (text: string, error = false) => {
    message = { text, error };
    renderStatus();
  };

  const hooks = {
    onChange: () => renderContent(),
    onError: (error: unknown) => showMessage(`Settings could not be saved: ${errorMessage(error)}`, true),
  };

  const { global } = await loadSettings(null);
  let session = new SettingsSession(selected, global, sites.get(selected ?? '') ?? {}, hooks);
  if (!selected) session.scope = 'global';
  let currentActions = session.actions(resolveFaces);

  const select = async (site: string | null) => {
    await session.flush();
    selected = site;
    history.replaceState(null, '', site ? `#site=${encodeURIComponent(site)}` : '#');
    const { global: latest } = await loadSettings(null);
    session = new SettingsSession(site, latest, sites.get(site ?? '') ?? {}, hooks);
    if (!site) session.scope = 'global';
    currentActions = session.actions(resolveFaces);
    message = null;
    renderNav();
    renderContent();
  };

  // One editor serves every selection; its actions go to the current session.
  const editor = new ProfileEditor(
    {
      setField: (field, value) => currentActions.setField(field, value),
      resetField: (field) => currentActions.resetField(field),
      setLanguage: (id, font) => currentActions.setLanguage(id, font),
      resetLanguage: (id) => currentActions.resetLanguage(id),
      resolveFaces,
    },
    { compact: false },
  );

  // Sidebar
  const search = h('input', {
    attrs: { type: 'search', placeholder: 'Find a site', 'aria-label': 'Find a site' },
    on: { input: () => renderNav() },
  });
  const nav = h('nav', { class: 'nav', attrs: { 'aria-label': 'Sites' } });

  function navButton(label: string, site: string | null, extra?: Node): HTMLButtonElement {
    return h(
      'button',
      {
        attrs: { type: 'button', 'aria-current': String(selected === site) },
        on: { click: () => void select(site) },
      },
      site === null ? icon('globe') : null,
      h('span', { class: 'name', text: label, title: label }),
      extra ?? null,
    );
  }

  function renderNav(): void {
    const query = search.value.trim().toLowerCase();
    nav.replaceChildren(navButton('All sites', null));
    nav.append(h('div', { class: 'nav-heading', text: `Sites with their own settings (${sites.size})` }));
    const matches = [...sites].filter(([site]) => !query || site.includes(query));
    if (!matches.length) {
      nav.append(h('div', { class: 'empty', text: sites.size ? 'No sites match your search.' : 'Open a site and use the toolbar button to give it its own settings.' }));
    }
    for (const [site, settings] of matches) {
      nav.append(navButton(site, site, settings.enabled === false ? h('span', { class: 'badge', text: 'Off' }) : undefined));
    }
  }

  // Content
  const title = h('h2');
  const power = createSwitch('Changes on', true, (checked) => session.setEnabled(checked));
  const powerLabel = h('span');
  const deleteButton = textButton(
    'trash',
    'Remove site',
    async () => {
      if (!selected) return;
      const site = selected;
      if (!(await confirmAction(`Remove ${site}?`, 'Its own settings are deleted and the all-sites defaults apply again.', 'Remove'))) return;
      await removeSite(site);
      sites.delete(site);
      await select(null);
    },
    'btn-ghost btn-danger',
  );
  const resetButton = textButton('reset', 'Reset defaults', async () => {
    if (await confirmAction('Reset the all-sites defaults?', 'Font, size and language defaults go back to the original values. Site settings stay.', 'Reset')) {
      session.resetScope();
    }
  }, 'btn-ghost');

  function renderStatus(): void {
    status.replaceChildren();
    if (!session.enabled) {
      const text = session.scope === 'site' ? 'Changes are off on this site.' : 'The all-sites defaults are paused. Sites with their own settings still use them.';
      status.append(h('div', { class: 'notice' }, icon('power'), h('span', { text })));
    }
    if (message) {
      status.append(h('div', { class: `notice${message.error ? ' notice-error' : ''}` }, icon(message.error ? 'info' : 'check'), h('span', { text: message.text })));
    }
  }

  function renderContent(): void {
    const isSite = session.scope === 'site';
    title.textContent = isSite ? selected! : 'All sites';
    power.checked = session.enabled;
    powerLabel.textContent = isSite ? 'Changes on this site' : 'Defaults on';
    power.setAttribute('aria-label', powerLabel.textContent);
    deleteButton.hidden = !isSite;
    resetButton.hidden = isSite;
    editor.update(session.editorState());
    editor.element.classList.toggle('off', !session.enabled);
    renderStatus();
    if (isSite && selected) {
      const wasOff = sites.get(selected)?.enabled === false;
      sites.set(selected, session.siteSettings);
      // Only the "Off" badge can change here; skip rebuilding the list on every slider step.
      if (wasOff !== (session.siteSettings.enabled === false)) renderNav();
    }
  }

  // Top bar actions
  const fileInput = h('input', {
    attrs: { type: 'file', accept: 'application/json,.json', hidden: true },
    on: {
      change: async () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file) return;
        try {
          const count = await importSettings(JSON.parse(await file.text()));
          sites = await loadAllSites();
          await select(null);
          showMessage(`Imported the all-sites defaults and ${count} site${count === 1 ? '' : 's'}.`);
        } catch (error) {
          showMessage(`Import failed: ${errorMessage(error)}`, true);
        }
      },
    },
  });

  const exportButton = textButton('download', 'Export', async () => {
    await session.flush();
    const data = await exportSettings();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = h('a', { attrs: { href: url, download: `gfg-typeface-settings-${new Date().toISOString().slice(0, 10)}.json` } });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const importButton = textButton('upload', 'Import', async () => {
    if (await confirmAction('Import settings?', 'Imported settings replace all current settings.', 'Choose file')) fileInput.click();
  });
  const shortcutsButton = textButton('keyboard', 'Shortcuts', () => void browser.tabs.create({ url: 'chrome://extensions/shortcuts' }));
  const resetAllButton = textButton('trash', 'Reset all', async () => {
    if (!(await confirmAction('Reset everything?', 'All-sites defaults and every site setting are deleted.', 'Reset all'))) return;
    await resetAll();
    sites = new Map();
    await select(null);
    showMessage('All settings were reset.');
  }, 'btn-ghost btn-danger');

  app.replaceChildren(
    h(
      'header',
      { class: 'topbar' },
      h('img', { attrs: { src: '/icon/32.png', alt: '' } }),
      h('h1', { text: 'gfg Typeface' }),
      h('span', { class: 'spacer' }),
      importButton,
      exportButton,
      shortcutsButton,
      resetAllButton,
      fileInput,
    ),
    h(
      'div',
      { class: 'layout' },
      h('aside', { class: 'sidebar' }, h('label', { class: 'search' }, icon('search'), search), nav),
      h(
        'main',
        { class: 'content' },
        h('div', { class: 'content-head' }, title, h('label', {}, powerLabel, power), resetButton, deleteButton),
        status,
        editor.element,
        h('p', {
          class: 'about',
          text: 'Settings sync through your browser account. Text size is relative to each site’s own sizes, and page layouts stay intact.',
        }),
      ),
    ),
  );
  app.removeAttribute('aria-busy');
  renderNav();
  renderContent();

  watchSettings(async () => {
    sites = await loadAllSites();
    const { global: latest } = await loadSettings(null);
    session.replace(latest, selected ? (sites.get(selected) ?? {}) : {});
    renderNav();
  });

  window.addEventListener('pagehide', () => void session.flush());
}

void main();
