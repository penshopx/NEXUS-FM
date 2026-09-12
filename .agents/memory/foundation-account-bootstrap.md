---
name: Foundation account bootstrap
description: Durable rule for provisioning the first usable NEXUS-FM organization context.
---

On first authenticated access, create the application user, one minimal organization, a `FACILITY_MANAGER` membership, an active organization context, and an audit event in one transaction. Do not seed facilities, assets, work, risks, scores, or other operational records.

**Why:** Task #01 must be immediately usable while remaining strictly within the authentication and organization-foundation boundary. Operational sample data would misrepresent evidence-based status and leak scope from later tasks.

**How to apply:** Keep first-access provisioning transactional and idempotent. Future onboarding may rename or enrich the organization, but it must not silently create operational evidence.