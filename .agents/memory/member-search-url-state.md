---
name: Member search URL state
description: How bookmarked authorization member searches behave across organization context changes.
---

Member-search filters and a selected member identity in the URL persist when the active organization changes. Restore them in the new context rather than silently clearing them.

**Why:** A URL is expected to remain bookmarkable and navigable through browser history, including when the authorization page remounts during an organization switch. Client persistence must not be treated as authorization.

**How to apply:** Keep filter, pagination, and selected stable identifiers across remounts. Restore a selected member only when both identifiers match a member returned by the authorized search API; otherwise render no binding details and make no binding request. Never trust URL metadata to widen access.