---
name: Long export consistency
description: Consistency and authorization rule for batched registry exports.
---

Long exports must separate data consistency from authorization freshness: page rows from one repeatable-read snapshot, but re-evaluate access against current committed authorization state before every batch.

**Why:** A single snapshot prevents concurrent rename, insert, or delete operations from moving rows across cursor boundaries. Reading authorization only from that snapshot would allow a revoked grant to remain effective for the rest of a long download. PostgreSQL timestamps can retain microseconds that JavaScript `Date` drops, causing keyset cursors to skip same-timestamp rows.

**How to apply:** Keep row queries in one read-only repeatable-read transaction and use a separate current-state database context for authorization checks. Abort when a current grant cannot be proven. For `(created_at, id)` cursors, preserve PostgreSQL's full timestamp text and cast it back in the cursor predicate instead of round-tripping through `Date`.