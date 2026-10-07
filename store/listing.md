# Chrome Web Store listing

## Name

gfg Typeface

## Summary (up to 132 characters)

Per-site fonts, text size and language fonts. Sizes stay relative to each site, so layouts keep working.

## Category

Accessibility

## Description

Make every site easy to read, in the font and size you like.

gfg Typeface lets you pick a font, a text size, line spacing and weight for each site, or set defaults for all sites. Text sizes stay relative to what each site chose, so headings stay bigger than body text and menus, grids and fixed headers keep their shape.

Read in more than one language? Give Urdu, Arabic, Persian, Hindi, Bengali, Chinese, Japanese, Korean, Russian and more their own font and size. The language font is used for every letter of that language, even inside English sentences, the way phones mix scripts.

Features:
- Fonts per site or for all sites, chosen from the fonts on your computer
- Text size from 50% to 200% of the site's own sizes
- Replacement fonts sized to match the font they replace
- A font and size per language
- Line spacing, weight and a separate code font
- Icon fonts, emoji and code keep working
- The browser's own page zoom in the same popup
- Live preview while you adjust
- Settings page with import, export and reset
- Toolbar badge, keyboard shortcuts and a right-click menu
- Works with iframes, web components and pages that load content as you scroll

Your settings sync through your browser account. Nothing is collected or sent anywhere.

## Single purpose

Change the fonts, text size, line spacing and weight of web pages, per site and per language, to make them easier to read.

## Permission justifications

- **Host permission (all sites):** the extension applies the user's typography settings to the pages they visit. Users pick fonts for any site, so it needs access to all sites. Page content is processed only in the browser.
- **storage:** saves the user's settings (fonts, sizes, per-site settings) in browser sync storage.
- **fontSettings:** lists the fonts installed on the user's computer for the font pickers.
- **scripting:** applies the user's settings to tabs that were already open when the extension was installed or updated, so they work without reloading.
- **contextMenus:** adds "Change fonts on this site" and "All settings" to the right-click menu.

## Data usage

- The extension does not collect or transmit user data.
- Stored data: user settings, including host names of sites the user configured, in the browser's sync storage only.
- Not sold, not transferred to third parties, not used for purposes unrelated to the single purpose, not used for creditworthiness or lending.

## Privacy policy

Link to `PRIVACY.md` in the repository.

## Assets

Rendered by `npm run store-assets` into `store/assets/`:

- `screenshot-1-popup.png`, `screenshot-2-before-after.png`, `screenshot-3-options.png`, `screenshot-4-more-options.png` (1280x800)
- `promo-small-440x280.png` (small promo tile)
- Store icon: `public/icon/128.png`
