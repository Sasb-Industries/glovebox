# 0002 — Two-step sign-in per profile

**Status:** Accepted (2026-10-01)

## Context
Glovebox needs two kinds of access to a Google account:

1. **Drive API** (list, create, move, search files) — requires an OAuth token. Google forbids OAuth consent inside embedded webviews; desktop apps must use the system browser (loopback redirect + PKCE).
2. **Google's web editors** — require a normal signed-in Google web session (cookies) inside the app's webview.

Merging these into one step means intercepting cookies or spoofing a browser for OAuth, which is fragile and repeatedly broken by Google.

## Decision
An "Add profile" wizard does both, once:
1. Opens the system browser for Drive OAuth consent.
2. Opens an in-app window for Google web login, stored in that profile's Electron session partition.

When the refresh token expires (weekly in Testing mode, see [0003](0003-testing-mode-byo-credentials.md)), show a one-click "Reconnect" banner rather than an error.

## Consequences
- Slightly longer first-run.
- Google blocks embedded Chromium on its sign-in pages ("This browser or app may not be secure"), even with a plain Chrome user-agent. Workaround (verified 2026-10-01):
  - While a webview is on `accounts.google.com`, it presents as **Firefox**.
  - It uses a Firefox user-agent, with no `Sec-CH-UA` client hints.
  - `preload/webview.ts` hides `navigator.userAgentData`, `navigator.vendor` and `window.chrome`.
  - Everywhere else, including the editors, presents as Chrome.
  - If Google tightens detection, this is the place to look.
