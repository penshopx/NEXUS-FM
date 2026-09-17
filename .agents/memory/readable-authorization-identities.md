---
name: Readable authorization identities
description: Contract rule for exposing human-readable authorization labels without widening policy-management access.
---

Authorization binding responses should pair canonical role labels with stable role IDs. Labels needed for access review belong on the read-safe binding response rather than requiring callers to fetch the policy-management catalog.

**Why:** Administrators with inspection-only access need understandable access reviews, but granting catalog access through a policy-management endpoint would couple readability to mutation authority.

**How to apply:** When adding authorization review surfaces, enrich already-authorized scoped responses with canonical display identity while preserving stable IDs and existing tenant filters. Do not relax management endpoint permissions for display-only needs.