# 0003 — Testing mode + bring-your-own credentials

**Status:** Accepted (2026-10-01)

## Context
Browsing a user's whole Drive needs the `drive` scope, which Google classes as **restricted**. A publicly published app with a restricted scope must pass Google's app verification plus a paid annual third-party security assessment (CASA).

## Decision
- Our Google Cloud project stays in **Testing** mode with our group listed as test users (limit 100).
- Anyone else using Glovebox creates their own Google Cloud project and supplies their own OAuth client ID/secret. The README documents how ([docs/google-cloud-setup.md](../google-cloud-setup.md)).
- OAuth credentials live in a git-ignored local file and are never committed.

## Consequences
- Testing-mode refresh tokens expire every 7 days → weekly one-click reconnect.
- Nothing in the design blocks a future move to a verified, published app.
