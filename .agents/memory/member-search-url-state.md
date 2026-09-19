---
name: Member search URL state
description: How bookmarked authorization member searches behave across organization context changes.
---

Member-search filters in the URL persist when the active organization changes. Restore the bookmarked search in the new context rather than silently clearing it.

**Why:** A URL is expected to remain bookmarkable and navigable through browser history, including when the authorization page remounts during an organization switch. Client persistence must not be treated as authorization.

**How to apply:** Keep filter and pagination state stable across remounts, but always send the organization filter through the authorized API so inaccessible organizations yield constrained or rejected results. Never trust URL metadata to widen access.