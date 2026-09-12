---
name: Authorization audit atomicity
description: Consistency rule for any operation that changes authorization state.
---

Any mutation that changes a role policy or role binding must write its immutable audit record in the same database transaction. Audit action names must describe the actual lifecycle transition.

**Why:** Committing an access change before its audit insert can leave security-relevant state without a corresponding history record, and generic action labels make review misleading.

**How to apply:** When adding or changing authorization mutations, keep state and audit writes atomic and use distinct actions for assignment, suspension, reactivation, expiry, update, and revocation.