---
name: Readable authorization identities
description: Contract rule for exposing human-readable authorization labels without widening policy-management access.
---

Authorization binding responses should pair canonical role and scope labels with stable IDs. Labels needed for access review belong on the read-safe binding response rather than requiring callers to fetch policy-management or registry endpoints.

Scope labels must also carry an explicit resolution state. A missing or historical target remains distinct from a scope that does not have a named target, and stable IDs remain visible even when no label can be resolved.

**Why:** Administrators with inspection-only access need understandable access reviews, but granting catalog access through management endpoints would couple readability to mutation authority. Silent fallback labels can also misrepresent deleted or unavailable targets.

**How to apply:** Enrich only rows already authorized for the caller. Resolve targets with both organization and object ID, preserve stable IDs, and return explicit resolved/missing/not-applicable state. Do not relax management permissions for display-only needs.