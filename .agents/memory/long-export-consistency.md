---
name: Long export consistency
description: Consistency and authorization rule for batched registry exports.
---

Long registry exports must separate data consistency from authorization freshness: page registry rows from one repeatable-read snapshot, but re-evaluate access against current committed authorization state before every batch.

**Why:** A single snapshot prevents concurrent rename, insert, or delete operations from moving rows across cursor boundaries. Reading authorization only from that snapshot would allow a revoked grant to remain effective for the rest of a long download.

**How to apply:** Any batched export that streams authorized registry data should keep its row queries in one read-only repeatable-read transaction and use a separate current-state database context for authorization checks. Abort rather than continue when a current grant cannot be proven.