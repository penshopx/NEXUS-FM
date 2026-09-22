---
name: Managed production trigram indexes
description: Why pg_trgm-backed indexes must not be part of the managed production schema.
---

Do not declare indexes using `gin_trgm_ops` in the development schema while the managed production database lacks `pg_trgm` and Publish does not include extension provisioning. Keep portable B-tree indexes and verify substring-search fallback performance instead.

**Why:** Publish validation failed when generated SQL tried to create trigram indexes in production, where the operator class was unavailable even though development had the extension.

**How to apply:** Before adding trigram indexes, confirm the extension is available in both environments and that the Publish diff provisions or recognizes it. Otherwise use extension-free indexes and retain bounded fallback performance tests.