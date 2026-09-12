---
name: Authorization audit atomicity
description: Consistency rule for any operation that changes authorization state.
---

Any mutation that changes a role policy or role binding must write its immutable audit record in the same database transaction. Audit action names must describe the actual lifecycle transition.

**Why:** Committing an access change before its audit insert can leave security-relevant state without a corresponding history record, and generic action labels make review misleading.

**How to apply:** When adding or changing authorization mutations, keep state and audit writes atomic and use distinct actions for assignment, suspension, reactivation, expiry, update, and revocation.

Resource mutations must also lock the authorization state used by their decision in a consistent order and keep the decision audit, resource write, and success audit in the same transaction.

**Why:** A transaction alone does not prevent a concurrent binding revocation or policy change from committing after authorization was read but before the resource write commits.

**How to apply:** Lock the active user, organization, membership, bindings, roles, role-permissions, and permissions before evaluating a mutation. Let concurrent access changes linearize before or after the complete mutation, never inside it.