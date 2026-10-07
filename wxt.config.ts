import { resolve } from 'node:path';
import { defineConfig } from 'wxt';

/** License texts that must ship with the extension, which bundles MIT-licensed WXT code. */
const LICENSE_FILES = ['LICENSE', 'THIRD_PARTY_NOTICES.md'];

export default defineConfig({
  srcDir: 'src',
  hooks: {
    'build:publicAssets': (_wxt, files) => {
      for (const name of LICENSE_FILES) files.push({ absoluteSrc: resolve(name), relativeDest: name });
    },
  },
  manifestVersion: 3,
  targetBrowsers: ['chrome'],
  manifest: {
    name: 'gfg Typeface',
    short_name: 'Typeface',
    description: 'Per-site fonts, text size and language fonts. Sizes stay relative to each site, layouts stay intact.',
    minimum_chrome_version: '133',
    permissions: ['storage', 'fontSettings', 'contextMenus', 'scripting'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'gfg Typeface',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    commands: {
      'toggle-site': {
        suggested_key: { default: 'Alt+Shift+F' },
        description: 'Turn changes on or off for the current site',
      },
      'size-up': {
        suggested_key: { default: 'Alt+Shift+Up' },
        description: 'Make text larger on the current site',
      },
      'size-down': {
        suggested_key: { default: 'Alt+Shift+Down' },
        description: 'Make text smaller on the current site',
      },
      'size-reset': {
        suggested_key: { default: 'Alt+Shift+0' },
        description: 'Reset text size on the current site',
      },
    },
  },
});
