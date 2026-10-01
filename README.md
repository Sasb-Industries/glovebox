# Glovebox

**The file explorer Google Drive forgot to ship.**

Glovebox is a desktop app for macOS and Windows that turns your Google account into a proper workstation:

- **A real file explorer:** folders, a path bar, back/forward, sortable columns, drag-and-drop, cut/copy/paste, right-click menus.
- **Docs, Sheets and Slides as app tabs**, not a pile of browser tabs. These are Google's real editors, minus the browser around them.
- **Folder tabs and split view** to move files the way you would in Windows Explorer.
- **Multiple Google accounts** as switchable profiles.

> 🚧 Early development. Nothing to install yet.

## Run it
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
