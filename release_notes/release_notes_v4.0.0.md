# gfg Typeface v4.0.0 - Release Notes

**Released:** October 2026 · **Status:** Stable · **Platform:** Chrome, Edge, Brave, Opera, Vivaldi and other Chromium browsers (Chromium 133 or newer)

---

gfg Font Changer is now **gfg Typeface**, rewritten from scratch. Pick a font, a text size, line spacing and weight for each site or for all sites, and give languages such as Urdu, Arabic, Hindi or Chinese their own font. Text sizes stay relative to each site's own sizes, so page layouts keep working. This is the first release published on GitHub Releases, as a zip to load unpacked.

---

## Breaking Changes

- **New name and a new build to load.** The repository no longer holds a loadable extension at its root. Load the folder unzipped from `gfgTypeface_4.0.0_chrome.zip`, which contains `manifest.json`.
- **Chromium 133 or newer** is required.
- **Page scaling is gone.** The popup now controls the browser's own per-site zoom, which keeps its own settings, so the 3.x scaling value is not carried over.

---

## Added

- **All-sites defaults with per-site overrides.** Sites without their own settings use your defaults; each site can override any setting or be switched off.
- **Relative text size.** Text size is a percentage of each site's own sizes, from headings to footnotes, without changing computed sizes or layout boxes.
- **Matched replacement fonts.** A replacement font can be sized so its lowercase letters are as tall as the font it replaces.
- **Language fonts.** A font and size per language, applied per glyph inside mixed-language text, with optional per-language line spacing and weight. Urdu, Arabic and Persian are told apart by the page's `lang` attributes and by letters only one of them uses.
- **Line spacing, weight and a code font.**
- **Live preview** in the popup while you drag a slider.
- **Settings page** with every site that has its own settings, plus import, export and reset. It shows the installed version with links to the latest release and the source code.
- **Toolbar badge, keyboard shortcuts and right-click menu.** Alt+Shift+F turns a site on or off; Alt+Shift+Up, Down and 0 change or reset its text size.
- **Coverage of the whole page:** iframes, open and closed shadow DOM, pages that load content dynamically, and pages with strict Content Security Policies. Icon fonts, emoji and code keep their fonts.

## Changed

- Settings are stored per site in the browser's sync storage.
- Changed pages appear without a flash of the original fonts, and large pages are processed in slices so scrolling stays smooth.

## Removed

- The `downloads`, `webNavigation`, `tabs` and `activeTab` permissions. gfg Typeface asks for `storage`, `fontSettings`, `scripting`, `contextMenus` and access to the sites you visit.

---

## Dependencies

- Built with WXT 0.21.4 and TypeScript 6.0. The extension bundles WXT's runtime helpers and `@wxt-dev/browser`, both MIT-licensed; see `THIRD_PARTY_NOTICES.md`, which ships inside the zip with `LICENSE`.
- No fonts are bundled: the extension uses the fonts installed on your computer.

---

## Installing

1. Download `gfgTypeface_4.0.0_chrome.zip` below and unzip it into a folder you will keep.
2. Open `chrome://extensions` (or `edge://extensions`, `opera://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.

Extensions loaded unpacked don't update on their own. To update later, unzip the new version over the same folder and press **Reload** on the extensions page: the browser ties your settings to the folder you loaded, so keep using that folder.

## Upgrading from gfg Font Changer 3.x

Unzip 4.0.0 over the folder you loaded 3.x from, replacing its files, and press **Reload**. Each site's font is kept, and the pixel size change becomes a percentage of a 16 px base (+2 px becomes 115%).

---

*Read the web your way.* 🔤
