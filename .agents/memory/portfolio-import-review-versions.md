---
name: Portfolio import review versions
description: Why reviewed CSV imports compare conservative registry versions and preserve a legacy direct-import path.
---

Reviewed portfolio imports compare a version derived from the CSV and every registry row in the active organization, not only rows named by the CSV. The version is deliberately conservative: unrelated edits in the same organization can require another review.

**Why:** A review can depend on ancestors, facility labels, duplicate codes, and authorization scope. Capturing only explicit parent rows would miss changes in the duplicate-check surface. The direct CSV import endpoint predates the review flow and existing direct callers do not send versions, so version checks currently apply only when the client sends a reviewed version.

**How to apply:** When changing import semantics, preserve the reviewed client's version round-trip and 409 recovery. If removing the unversioned direct-import path, plan migration of direct callers and tests rather than silently treating absent versions as reviewed.