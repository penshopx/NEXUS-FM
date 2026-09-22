---
name: Access revision signals
description: Reliability rule for immediate authorization invalidation and reconnect recovery.
---

Treat realtime access-change events as a latency optimization, not the source of truth. Events must use shared fanout across API instances, while clients compare a revision derived from persistent authorization state whenever they reconnect or regain focus and fail closed while refreshing changed access.

**Why:** Process-local fanout misses clients connected to another API instance, and streams can disconnect or miss events during restarts. Shared fanout handles the normal multi-instance path; a persistent revision check recovers from every missed signal. A notification failure after commit must not turn a successful access mutation into an ambiguous API failure that callers may retry.

**How to apply:** Every membership, role binding, or role policy mutation must change the persistent inputs to the revision and attempt a targeted event through shared infrastructure after commit. Retry transient publication failures, report exhausted delivery, and do not reject the committed mutation response solely because best-effort notification failed. Clients should clear authorization data immediately on an event and rehydrate it from the server.