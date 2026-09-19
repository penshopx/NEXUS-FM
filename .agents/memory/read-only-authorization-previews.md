---
name: Read-only authorization previews
description: Audit behavior for validation-only operations that evaluate real mutation permissions.
---

Validation-only previews must run the same authorization decisions as the eventual mutation, but must not persist authorization decision audits because no action was taken.

**Why:** A portfolio preview must accurately predict whether every create operation is allowed while remaining fully read-only, including registry and audit tables.

**How to apply:** Use audit suppression only for trusted server-side preview paths. The eventual commit must re-run authorization with normal decision auditing enabled.