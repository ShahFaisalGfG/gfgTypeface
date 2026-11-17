# gfg Typeface v4.0.1 - Release Notes

**Released:** November 2026 · **Status:** Stable · **Platform:** Chrome, Edge, Brave, Opera, Vivaldi and other Chromium browsers (Chromium 133 or newer)

---

gfg Typeface now tells you when a new version is out. Browsers never update an extension loaded unpacked, so once a day gfg Typeface asks GitHub for the latest release and, when it is newer than yours, says so in the popup and on the settings page. Nothing is downloaded or installed on its own.

---

## Added

- **Update notice.** "gfg Typeface X.Y.Z is available" appears in the popup and on the settings page, with links to **Download** the zip, read **What's new** and follow **How to update**. **Dismiss** hides it until the next version.
- **Updates switch.** **Check for updates once a day** on the settings page turns the check off and on. It is on by default.

## Changed

- **New permission: `alarms`**, which schedules the daily check. The browser shows no warning for it.
- **Privacy:** the daily check is one anonymous request to `api.github.com`. It carries none of your settings or sites. The check's own state (the switch, the last check time, the latest release found and the dismissed version) stays on this device in the browser's local storage. See `PRIVACY.md`.

---

## Updating from 4.0.0

1. Download `gfgTypeface_4.0.1_chrome.zip` below and unzip it over the folder you loaded, replacing its files.
2. On the extensions page, press **Reload** on gfg Typeface.

Keep the same folder: the browser ties your settings to it. From this version on, the extension tells you when the next one is out.

---

*Read the web your way.* 🔤
