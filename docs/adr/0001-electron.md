# 0001 — Electron over Tauri

**Status:** Accepted (2026-10-01)

## Context
Glovebox's core is embedding Google's real editors (Docs, Sheets, Slides) as tabs, on macOS and Windows, with isolated sessions per profile.

Tauri uses the OS webview: WebKit on macOS, WebView2 (Chromium) on Windows. That means two different engines running Google's editors, a less mature multi-webview-per-window story, and harder per-profile storage isolation on WebKit.

## Decision
Use Electron (TypeScript + React). It bundles Chromium, so Google's editors behave exactly as they do in Chrome on both OSes. Session partitions (per-profile isolation) and multiple web views per window are first-class.

## Consequences
- ~150 MB download, higher RAM. Mitigated by lazy-loading tabs.
- Accepted reluctantly; a rewrite on a lighter stack remains possible later.
