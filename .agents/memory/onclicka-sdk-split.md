---
name: Onclicka TMA SDK split
description: Onclicka uses different SDK scripts per ad format in Telegram Mini Apps — loading the wrong one silently never exposes initCdTma.
---

Onclicka's Telegram Mini App ad formats use **different SDK scripts**:

- **Rewarded video (in-stream)**: `https://js.onclckvd.com/in-stream-ad-admanager/tma.js` — exposes `window.initCdTma({ id: <numeric spot id> })` → resolves to a `show()` function. No `data-admpid` attribute needed.
- **Interstitial / Inpage**: `https://js.onclckmn.com/static/onclicka.js` with `data-admpid="<ad code id>"` — auto-initializing, no JS API, ads render on their own (passive format, no reward callback).

**Why:** We loaded `onclicka.js` and polled for `initCdTma` — it never appears there (the script's minified source has zero occurrences; it only registers `__adFormats` module loaders). Days of "SDK unavailable" errors that no polling/timeout fix could solve. Verified against Onclicka's official help pages (`onclicka.com/help/publishers/video-how-to-integrate-the-code`).

**How to apply:** For any Onclicka format, check which script the format's own help page specifies — do not assume one shared SDK. Note the SDK is served gzip-compressed; `curl` output must be gunzipped before grepping.
