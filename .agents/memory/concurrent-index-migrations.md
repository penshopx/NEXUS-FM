---
name: Concurrent index migrations
description: Safety rules for PostgreSQL indexes that must be installed without blocking registry writes.
---

Run concurrent index builds outside transaction blocks while retaining a session-level migration lock. Record the migration only after every index is valid. On retry, keep a valid existing index, but drop and rebuild an invalid index left by an interrupted build.

**Why:** PostgreSQL concurrent index creation avoids a long write-blocking lock, but cannot run inside a transaction and may leave an invalid catalog entry if interrupted.

**How to apply:** Route every supported migration command through the safe runner. Keep companion statements retry-safe, preserve migration fingerprint and destructive-SQL preflight checks for non-empty databases, and verify catalog validity rather than checking index names alone.