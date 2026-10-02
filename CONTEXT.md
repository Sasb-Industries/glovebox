# Glovebox

> The file explorer Google Drive forgot to ship.

Glovebox is a desktop app (macOS + Windows) that acts as a central workstation for a Google account. It gives Google Drive a real, Windows-Explorer-style file browser, and opens Docs/Sheets/Slides as tabs inside the app — a chrome-less window into Google's own editors — so they stop flooding the browser.

Guiding principle: **the codebase should be as simple as possible for the functionality.** Reuse Google's own UI (editors, previews, share dialog) wherever it's good enough; only build what Google gets wrong.

## Vocabulary

| Term | Meaning |
|---|---|
| **Profile** | One Google account signed into Glovebox. Has its own isolated web session, its own Drive API token, and its own tabs. Switching profile switches the whole app. |
| **Rail** | The collapsible vertical tab list on the left of every window. **Files** at the top, then doc tabs, then ⚙ Settings at the bottom. Collapses to icons only. |
| **Files** | The top rail entry. Its label is the current **section**. From a doc, clicking it returns to the explorer view. In the explorer view, clicking it opens a menu of sections with a check mark on the current one. |
| **Section** | A top-level area of Drive: My Drive (the usual one), Shared drives, Shared with me, Recent, Starred, Trash. Chosen from the Files menu; there is no separate nav pane. |
| **Doc tab** | A rail tab holding an open file (Google editor or preview). Compact: icon + truncated title. Reorderable. |
| **Explorer view** | Shown when Files is selected: path bar, search, details list, status bar, and the dock. |
| **Dock** | Floating pill at bottom-center of the explorer view holding **folder tabs** and a **+**. No colored border; follows the theme. |
| **Folder tab** | One explorer location in the dock. Clicking **+** turns the current location into a folder tab and opens a new one. |
| **Split view** | Two folder tabs side by side in the explorer view, for drag-and-drop moves between them. |
| **Doc view** | Shown when a doc tab is selected: the document fills the content area; the dock is hidden. Explorer view and doc view are never shown at the same time. |
| **Preview tab** | A doc tab for a non-Google file (PDF, image, video, zip…), showing Drive's preview on a gray background, with an "Open in default app" button. |

## Decisions

### Platform & stack
- Electron + TypeScript + React. One engine (Chromium) on both OSes so Google's editors behave exactly as in Chrome. See [ADR 0001](docs/adr/0001-electron.md).
- Documents render in `<webview>` tags. See [ADR 0005](docs/adr/0005-webview-tag.md).
- Online only. No local file copies or sync (Google's "Drive for desktop" already does that).

### Accounts & auth
- Each profile signs in twice, once, via an "Add profile" wizard: Drive API OAuth in the system browser (loopback + PKCE), and a Google web login in an in-app window for the editors' session. See [ADR 0002](docs/adr/0002-two-step-sign-in.md).
- Multiple switchable profiles in v1. Each profile = an isolated Electron session partition + its own refresh token.
- Our Google Cloud project stays in **Testing** mode (≤100 listed test users; refresh tokens expire every 7 days → one-click "Reconnect" banner). Anyone else brings their own Google Cloud credentials. See [ADR 0003](docs/adr/0003-testing-mode-byo-credentials.md).
- Work/school accounts may be blocked by their admin's third-party-app policy. Personal accounts are fine.

### Explorer
- Explorer-style layout: sections picked from the rail's Files menu (no nav pane, since switching is rare), breadcrumb path bar, back/forward/up, details view (Name / Modified / Owner / Size, sortable). Details view only in v1; icon/thumbnail view later.
- Drive shortcuts behave like Windows shortcuts — opening one jumps to the real location.
- Search box: scoped to the current folder by default, one click to widen to all of Drive. Uses Drive full-text search.
- File operations in v1: right-click (Rename, Delete to Trash, Make a copy, Copy link, Star), drag to move, drag in from the OS to upload, cut/copy/paste. Sharing uses Google's own share dialog.
- **Create (+) menu:** creates in the current folder and opens the new file in a new doc tab, named Untitled. Includes every Google file type that is cheap to support (Doc, Sheet, Slides, Form, Drawing…), plus Folder, Upload file, Upload folder. The type list is data; a type that needs special-case code is dropped rather than paid for.

### Dock & split view
- Dock starts as just **+**; clicking it adds folder tabs (📁 📁 +). New folder tabs open at My Drive. Ctrl/Cmd+T also adds one.
- Each dock tab shows a folder icon plus a short truncated name, so tabs can be told apart. Close with × on hover or middle-click. With one tab left, the dock goes back to just **+**.
- Each folder tab is its own explorer with its own back/forward history. The clipboard (cut/copy) is shared across tabs.
- Dragging a file and hovering over a folder tab for ~0.5s opens that tab so you can drop into it. In split view it opens in the *other* pane, so the source stays visible. Dropping straight onto a dock tab moves the files into that tab's folder.
- Split view, started either by **dragging a folder tab over the left/right half** or by **right-click → "Open in split view (left/right)"**. Right-click also offers "Close split view". The drop side is simply whichever half the cursor is over; there is no dead zone.
- In split view each side has an × at the end of its toolbar that closes that side; the other side takes over and the tab stays in the dock.
  - While dragging: a translucent copy of the icon follows the cursor, and the target half of the window is grayed out to preview where it lands (Windows-snap style).
- v1 split is folders-only, but built so doc + folder / doc + doc can be added later without a rewrite.

### Tabs & windows
- Opening a file that's already open focuses its existing tab and briefly flashes it. Ctrl/Cmd+click or middle-click forces a second tab.
- Links inside a document: Google Docs/Drive links open as new doc tabs; all other links open in the system browser. Glovebox is not a general-purpose browser.
- Non-Google files open as preview tabs. Office files (.docx/.xlsx/.pptx) open in Google's editors in Office-editing mode, matching Drive.
- Tabs can be dragged out of the rail into a new window and dragged back to merge. Always on, no setting.
- Restored tabs load lazily (only when clicked) — each live Google editor costs 150–300 MB.

### Preferences
- **Restore tabs on launch** — default **off** (fresh start). A restart triggered by an app update always restores.
- **Open files in their own window** — default **off**.
- **Theme** — Light / Dark / System (default System). Custom minimal neutral style, clean like Google's but our own.
- **Keyboard shortcuts** — defaults mimic Chrome + Google Drive. Editable table: click an action, press the new key; "Reset to defaults". Shortcuts that Google's editors use go to the editor when it's focused.
- **Software updates** — current version + "Check for updates".

### Distribution & updates
- GitHub Actions builds macOS + Windows on every version tag (`v*`) and attaches them to a GitHub Release. Unsigned (no paid signing).
- The app checks daily; a dot appears on ⚙ when an update is available.
  - Windows: one-click download → restart → updated.
  - macOS: downloads and opens the new build; user drags it to Applications (unsigned apps can't self-update on macOS).
- License: GPLv3. Public repo. See [ADR 0004](docs/adr/0004-gplv3.md).

## Build order
1. **Walking skeleton** — app shell, one profile + sign-in, browse My Drive, double-click opens a Doc in a rail tab.
2. **Explorer for real** — all sections, search, create menu, file operations, drag/drop, uploads, cut/copy/paste.
3. **Dock & split** — folder tabs, drag-hover-to-switch, split view.
4. **Preferences & profiles** — multiple profiles, multiple windows, restore-tabs, own-window, theme, shortcut editor.
5. **Shipping** — GitHub Actions builds, Releases, in-app updater, README with Google Cloud setup.
