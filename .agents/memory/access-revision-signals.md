---
name: Access revision signals
description: Reliability rule for immediate authorization invalidation and reconnect recovery.
---

Treat realtime access-change events as a latency optimization, not the source of truth. Events must use shared fanout across API instances, while clients compare a revision derived from persistent authorization state whenever they reconnect or regain focus and fail closed while refreshing changed access.

**Why:** Process-local fanout misses clients connected to another API instance, and streams can disconnect or miss events during restarts. Shared fanout handles the normal multi-instance path; a persistent revision check recovers from every missed signal.

**How to apply:** Every membership, role binding, or role policy mutation must change the persistent inputs to the revision and publish a targeted event through shared infrastructure after commit. Clients should clear authorization data immediately on an event and rehydrate it from the server.