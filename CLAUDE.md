# Glovebox

Desktop app (Electron + TypeScript + React, macOS + Windows) that gives Google Drive a real file explorer and opens Google's editors as in-app tabs.

## Docs
- `CONTEXT.md` — what the app is, vocabulary (profile, rail, dock, folder tab, split view…), all product decisions, build order. Read first; use its terms.
- `docs/adr/` — architecture decisions and why. Add a new ADR for any big new decision.
- `docs/google-cloud-setup.md` — OAuth credentials setup; credentials go in a git-ignored `.env`.

## Working rules
- **Always commit and push to GitHub when a feature or change is done — no need to ask.** The user tests from what's pushed; reverting is fine.
- Keep the codebase as simple as possible for the functionality. Reuse Google's own UI (editors, previews, share dialog) instead of rebuilding it.
- Never commit `.env` or any OAuth credentials.
