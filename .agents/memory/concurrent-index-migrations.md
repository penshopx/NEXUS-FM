---
name: Concurrent index migrations
description: Safety rules for PostgreSQL indexes that must be installed without blocking registry writes.
---

Run concurrent index builds outside transaction blocks while retaining a session-level migration lock. Record the migration only after every index is valid. On retry, keep a valid existing index, but drop and rebuild an invalid index left by an interrupted build. On process cancellation, explicitly cancel the active PostgreSQL backend before closing the client.

**Why:** PostgreSQL concurrent index creation avoids a long write-blocking lock, but cannot run inside a transaction and may leave an invalid catalog entry if interrupted. Terminating the client process alone does not guarantee that a waiting server query stops promptly, so advisory and table locks may survive the deployment process.

**How to apply:** Route every supported migration command through the safe runner. Keep companion statements retry-safe, preserve migration fingerprint and destructive-SQL preflight checks for non-empty databases, and verify catalog validity rather than checking index names alone. Cancellation checks should bound lock-release time, confirm registry writes recover, and then exercise the invalid-index retry path.