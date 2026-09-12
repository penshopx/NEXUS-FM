---
name: Drizzle composite unique introspection
description: Why composite UNIQUE declarations may need physical-column order for non-interactive Drizzle reconciliation.
---

Patch Drizzle Kit's PostgreSQL constraint introspection to read composite columns in constraint-key order and preserve the `indnullsnotdistinct` flag.

**Why:** The released introspector reads composite columns through `information_schema` in physical table-column order and hardcodes `nullsNotDistinct: false`. Existing, semantically identical constraints are then reported as new and can trigger unsafe truncate prompts.

**How to apply:** Keep the workspace patch active until the upstream package fixes both behaviors. Confine `push` reconciliation checks to disposable databases; automatic post-merge setup must keep using authoritative migrations. When upgrading Drizzle Kit, remove the patch only after non-interactive reconciliation preserves full data and schema snapshots.
