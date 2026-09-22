---
name: Managed-publish authorization compatibility
description: Why authorization persistence must remain compatible with the legacy production role columns and enums.
---

Keep authorization bindings and role-permission persistence on the legacy canonical-role columns and production enum types. The UUID role registry may provide API identifiers and metadata, but runtime authorization must resolve those IDs to canonical role codes before reading or writing authorization rows. Preserve `REVOKED` as a readable legacy status, deny it at runtime, and reject it as a new API write.

**Why:** Replit Publish synchronizes schema shape but cannot perform the required role-code-to-UUID backfill, audit payload migration, or `REVOKED` conversion. A direct UUID cutover would add required columns to populated tables, remove legacy data-bearing columns, and make existing grants unreadable.

**How to apply:** Before publishing authorization schema changes, require a schema diff with no drops, truncation, legacy enum conversion, or required unbackfilled columns. Keep production preflight checks for uniqueness and keep tests covering deprecated roles and persisted revoked bindings as denied.