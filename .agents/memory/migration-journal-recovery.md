---
name: Migration journal recovery
description: Safe handling when database objects exist but Drizzle migration history is empty.
---

If the expected schema already exists while the migration journal is empty, never rerun baseline DDL or use schema push as a shortcut. Verify tables, columns, enum types, foreign keys, indexes, and null-safe constraints against the corresponding migrations before recording those migrations as applied.

**Why:** A post-merge migration attempted to replay already-applied authorization DDL because its journal was empty. The replay stopped mid-chain and prevented the API from starting, even though the existing objects matched the generated migrations.

**How to apply:** Treat journal repair as metadata recovery, not schema creation. Fail closed on any fingerprint mismatch; after verified journal recovery, run the normal forward-only migration command and confirm the API starts.

When converting legacy Drizzle migrations to timestamped folders, preserve their original chronological timestamps. A newer folder timestamp can make an upgraded migrator replay an already-recorded migration even when its SQL hash is present in the database journal.

**Why:** Drizzle's folder-based migrator decides what is pending from folder time relative to the latest journal timestamp; matching hashes alone do not prevent replay.

**How to apply:** Before migration execution, verify every local historical hash is already tracked. If folder chronology and journal chronology disagree, skip database mutation and fail closed on any untracked or unknown hash until ordering is reconciled.

For forward migrations after a folder-timestamp conversion, determine pending work by the contiguous local hash chain rather than folder time alone. Apply only the untracked tail under one database transaction and advisory lock, and reject destructive SQL, unknown hashes, or gaps.

**Why:** A valid new index migration could not run through the upgraded migrator because two older, already-tracked folders had later timestamps than their journal entries.

**How to apply:** Historical hashes must form an uninterrupted applied prefix. New hashes may only extend that prefix; execute that tail transactionally and record each successful hash normally.