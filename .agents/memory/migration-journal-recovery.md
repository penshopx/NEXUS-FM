---
name: Migration journal recovery
description: Safe handling when database objects exist but Drizzle migration history is empty.
---

If the expected schema already exists while the migration journal is empty, never rerun baseline DDL or use schema push as a shortcut. Verify tables, columns, enum types, foreign keys, indexes, and null-safe constraints against the corresponding migrations before recording those migrations as applied.

**Why:** A post-merge migration attempted to replay already-applied authorization DDL because its journal was empty. The replay stopped mid-chain and prevented the API from starting, even though the existing objects matched the generated migrations.

**How to apply:** Treat journal repair as metadata recovery, not schema creation. Fail closed on any fingerprint mismatch; after verified journal recovery, run the normal forward-only migration command and confirm the API starts.