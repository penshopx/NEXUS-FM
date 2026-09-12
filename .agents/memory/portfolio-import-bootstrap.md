---
name: Portfolio import bootstrap
description: Authorization boundary for importing a newly created facility and its descendants atomically.
---

An organization-scoped facility registration grant may satisfy descendant CREATE permissions only when the facility was authorized and created earlier in the same atomic portfolio import.

**Why:** A new facility cannot have a persisted facility binding before it exists, but splitting facility and descendant imports would leave partial hierarchies. Extending this exception to persisted facilities or ordinary mutations would weaken object-scoped authorization.

**How to apply:** Keep the exception server-trusted, transaction-local, and tied to the newly imported facility ID. Continue evaluating each descendant's actual CREATE permission, active membership, role state, explicit denies, and organization scope.