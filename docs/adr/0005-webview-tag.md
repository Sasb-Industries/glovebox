# 0005 — Documents render in `<webview>` tags

**Status:** Accepted (2026-10-01)

## Context
Each doc tab hosts a Google editor. Electron offers two ways to do this:

- **`WebContentsView`:** native views positioned by the main process. These always draw on top of the app's HTML, so menus, tooltips and drag previews can't overlap them.
- **`<webview>`:** a DOM element in the app's own UI, laid out with normal CSS.

## Decision
Use `<webview>`, with the profile's `persist:profile-<id>` partition.

Hidden tabs stay mounted (visibility hidden, not `display: none`), so documents keep their state. The main process strips preloads from webviews, only allows profile partitions, and routes popups: Google file links become tabs, and other links open in the system browser.

## Consequences
- Layout, dragging and overlays are plain React and CSS, which is the simplest option.
- A webview can't move between windows. Dragging a tab to a new window reloads the document there, which is fine because Google's editors keep their state on the server.
- Electron discourages `<webview>` for stability reasons. If it becomes a problem, moving to `WebContentsView` is contained to `DocView`.
