---
name: Access revision signals
description: Reliability rule for immediate authorization invalidation and reconnect recovery.
---

Treat realtime access-change events as a latency optimization, not the source of truth. A signed-in client must compare a revision derived from persistent authorization state whenever it reconnects or regains focus, and fail closed while refreshing changed access.

**Why:** Streams can disconnect or miss events during process restarts. A persistent revision check detects changes made while the client was offline and prevents stale administration controls from remaining usable.

**How to apply:** Every membership, role binding, or role policy mutation must change the persistent inputs to the revision and publish a targeted event after commit. Clients should clear authorization data immediately on an event and rehydrate it from the server.