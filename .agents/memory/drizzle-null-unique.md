---
name: Drizzle composite unique introspection
description: Why composite UNIQUE declarations may need physical-column order for non-interactive Drizzle reconciliation.
---

Use the Drizzle 1.0 release line that reads composite columns in constraint-key order and preserves NULLS NOT DISTINCT metadata. Keep Drizzle Kit and Drizzle ORM on the same release channel.

**Why:** Older stable introspection reordered composite keys and discarded NULLS NOT DISTINCT, causing false schema diffs and unsafe truncate prompts. The 1.0 migration-folder converter also aborts partway when custom migrations lack snapshots.

**How to apply:** For custom migrations without snapshots, construct accurate intermediate snapshots from the schema at each historical boundary, but preserve every migration SQL file byte-for-byte so existing database hashes still match. Confine `push` checks to disposable databases and verify post-merge migrations preserve rows without prompts.
