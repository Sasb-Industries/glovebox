# Glovebox

**The file explorer Google Drive forgot to ship.**

Glovebox is a desktop app for macOS and Windows that turns your Google account into a proper workstation:

- **A real file explorer:** folders, a path bar, back/forward, sortable columns, drag-and-drop, cut/copy/paste, right-click menus.
- **Docs, Sheets and Slides as app tabs**, not a pile of browser tabs. These are Google's real editors, minus the browser around them.
- **Folder tabs and split view** to move files the way you would in Windows Explorer.
- **Multiple Google accounts** as switchable profiles.

## Install
Download the latest version from [Releases](https://github.com/Sasb-Industries/glovebox/releases/latest).

Glovebox isn't signed with a paid Apple or Microsoft certificate, so the first launch needs one extra step.

**macOS:** download the `.dmg` (`arm64` for Apple Silicon, `x64` for Intel), open it, and drag Glovebox into Applications. The first time you open it, macOS will refuse.
1. Open **System Settings → Privacy & Security**.
2. Scroll down and click **Open Anyway** next to Glovebox.

Or run this once in Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/Glovebox.app
```

**Windows:** run `Glovebox-Setup-<version>.exe`. If SmartScreen says "Windows protected your PC", click **More info → Run anyway**.

**Updates:** Glovebox checks once a day; a dot appears on ⚙ Settings when there's a new version.
- **Windows:** one click updates it.
- **macOS:** it downloads the new `.dmg` for you to drag into Applications.

> Glovebox runs in Google's "Testing" mode, so only accounts the maintainer has added as test users can sign in, and you'll be asked to reconnect about once a week. To run it for anyone else, use your own Google Cloud credentials (below).

## Run from source
1. Install [Node.js](https://nodejs.org) 22 or newer.
2. Set up Google credentials in a `.env` file. See [docs/google-cloud-setup.md](docs/google-cloud-setup.md).
3. Run:
   ```
   npm install
   npm run dev
   ```

## Docs
- [CONTEXT.md](CONTEXT.md) — what Glovebox is, its vocabulary, and the design decisions.
- [docs/adr](docs/adr) — architecture decision records.

## License
[GPLv3](LICENSE). Free to use, study, modify and share. Any distributed fork must stay open source under the same license.
