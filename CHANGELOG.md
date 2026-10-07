# Changelog

## 4.0.0

gfg Font Changer is now **gfg Typeface**, rewritten from scratch.

### Added

- All-sites defaults with per-site overrides and a per-site off switch.
- Text size as a percentage of each site's own sizes, without layout breakage.
- Matching of replacement fonts to the x-height of the fonts they replace.
- Per-language fonts and sizes, applied per glyph inside mixed-language text.
- Line spacing, weight and code font settings.
- Live preview in the popup.
- Settings page with site list, import, export and reset.
- Toolbar badge, keyboard shortcuts and right-click menu.
- Support for iframes, shadow DOM, pages that load content dynamically and pages with strict Content Security Policies.
- Icon fonts, emoji and code keep their fonts.

### Changed

- Page scaling now uses the browser's own per-site zoom instead of a CSS transform.
- Settings are stored per site in browser sync storage. Fonts and font size changes from 3.x are migrated; the old scaling value is dropped because zoom keeps its own settings.
- Requires Chromium 133 or newer.

### Removed

- The `downloads`, `webNavigation`, `tabs` and `activeTab` permissions.
