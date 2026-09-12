---
name: Authorization object resolvers
description: Locked rule for activating reserved object-scoped permissions in future operational modules.
---

Reserved operational permissions must remain fail-closed until the owning domain provides a server-side resolver. A matching caller-provided resource ID or binding scope ID is not proof of access.

**Why:** Task #02 locks the authorization structure before operational entities exist. Allowing UUID equality alone would permit access without proving object existence, organization ownership, hierarchy, assignment, vendor relationship, ownership, or domain state.

**How to apply:** When an operational module is introduced, connect its resource type to the central evaluator through a server resolver that verifies existence, organization isolation, required ancestry or assignment relationship, and any state-dependent rule. Keep unresolved types denied.