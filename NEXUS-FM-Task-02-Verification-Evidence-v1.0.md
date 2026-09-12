# NEXUS-FM Task #02 Verification Evidence v1.0

## Final decision

**Task #02 — Authorization & Permission Matrix**

- `E2E VERIFIED`
- `STABLE`
- `LOCKED`

Decision date: 12 September 2026

This decision applies only to the authorization foundation described below. It does not claim that Facility, Asset, Inspection, Work Order, Project, Cost, Compliance, Vendor, or other operational modules exist.

## Locked scope

Task #02 adds:

- canonical `RESOURCE.ACTION` permission catalog;
- immutable seven-role vocabulary from Task #01;
- role-to-permission capability matrix;
- scoped user role bindings;
- binding lifecycle controls;
- central server-side authorization evaluator;
- deny-by-default behavior and stable reason codes;
- explicit-deny precedence;
- organization isolation and active-organization enforcement;
- Platform Admin separation from operational roles;
- protected authorization introspection and role-binding administration APIs;
- authorization-sensitive audit records;
- idempotent permission and role-capability seed;
- additive database migration chain and controlled Task #01 baseline adoption.

## Scope safety

The evaluator never treats a caller-provided UUID as proof of access.

- Foundation resource IDs are resolved server-side.
- Organization-scoped user/session access requires a membership in the active organization.
- Organization IDs must match the active organization unless a valid platform scope applies.
- Permission IDs must exist before platform permission administration can allow access.
- Audit event IDs must resolve within the active organization unless a valid platform scope applies.
- Operational object scopes remain fail-closed because their domain entities and relationship resolvers do not yet exist.

Future operational modules must provide server resolvers that prove object existence, organization ownership, ancestry or assignment, and relevant domain state before object-scoped permissions can become effective.

## Platform Admin separation

`PLATFORM_ADMIN` can manage authorization and platform foundation capabilities but is not an operational superuser.

Verified examples:

- `ROLE.MANAGE` allowed for a valid Platform Admin platform binding;
- permission and role catalog administration allowed;
- `WORK_ORDER.EXECUTE` denied;
- `WORK_ORDER.VERIFY` denied;
- self-assignment rejected;
- cross-organization binding mutation rejected.

## Binding lifecycle

- Supported statuses: `ACTIVE`, `SUSPENDED`, `EXPIRED`, and `REVOKED`.
- Suspended and expired bindings do not grant permissions.
- Revocation requires a nonempty reason.
- `REVOKED` is terminal; it cannot be patched back to `ACTIVE`.
- Update and revoke operations lock the binding row before lifecycle checks and mutation.
- Concurrent update/revoke testing ended with the binding in `REVOKED`.
- Mutation audit events contain actor, target, before state, after state, reason, and timestamp without credentials or session material.

## Database and migration evidence

Migration chain:

1. Task #01 foundation baseline;
2. additive Task #02 authorization schema;
3. `NULLS NOT DISTINCT` scoped-binding uniqueness hardening.

Clean-install verification:

- isolated empty PostgreSQL database created;
- all three migrations applied successfully;
- authorization catalog seeded twice;
- no duplicate permission codes;
- no duplicate role, permission, and scope assignments.

Existing Task #01 upgrade verification:

- isolated pre-journal Task #01-shaped database created;
- existing user, organization, membership, active context, and audit event inserted;
- baseline adoption validated and recorded;
- additive Task #02 migrations applied;
- all Task #01 data and audit history preserved;
- exactly one compatible organization-scoped foundation binding backfilled.

Baseline adoption refuses to certify incompatible schemas. Negative tests passed for:

- altered/missing column;
- missing unique constraint;
- same-named view instead of a table;
- pre-existing authorization enum type;
- nonempty migration history.

The adopter compares relation kinds, canonical role labels, columns, data types, nullability, defaults, primary/unique/foreign-key constraints, and indexes before recording the foundation migration hash.

## Automated service and database tests

Command:

```text
pnpm --filter @workspace/api-server run test:authorization
```

Result:

```text
13 tests passed
0 failed
```

Covered:

- allowed foundation permission;
- unknown permission denial;
- cross-organization context denial;
- cross-organization direct-resource-ID denial;
- fail-closed unresolved object scopes;
- technician cannot verify or close executed work;
- suspended binding denial;
- explicit-deny precedence;
- direct service-layer administrative bypass rejection;
- Platform Admin operational separation;
- terminal revocation and complete audit reason;
- concurrent update/revoke behavior;
- concurrent first-access bootstrap idempotency.

## API and adversarial E2E evidence

Verified with generated Clerk test identities and direct API calls:

- authenticated `GET /api/authorization/me` returns the active organization, role, effective permissions, and scopes;
- unauthenticated authorization endpoints return `401`;
- `SESSION.VIEW` allows for a valid Facility Manager organization binding;
- unknown and ungranted permissions deny;
- Facility Manager cannot access permission catalog, role catalog, or role-binding administration;
- Platform Admin can access foundation authorization administration;
- Platform Admin receives no Work Order execution or verification bypass;
- same-organization `USER.VIEW` direct ID allows;
- cross-organization `USER.VIEW` direct ID denies with `SCOPE_DENIED`;
- role-binding create, suspend, revoke, and audit flows work;
- DELETE without a reason returns `400`;
- DELETE with a reason revokes;
- PATCH from `REVOKED` to `ACTIVE` returns `400`;
- unsupported operational object-scoped binding creation rejects;
- denied authorization checks append safe authorization audit records;
- no permission, role-capability, or foundation-binding duplicates were observed.

## Task #01 regression

Verified after Task #02:

- first authenticated access remains transactional and idempotent;
- concurrent first requests no longer race into duplicate user creation;
- dashboard and profile remain protected;
- organization context persists after reload;
- sign-out removes authenticated access;
- `/api/session`, `/api/organizations`, `/api/foundation/summary`, and `/api/authorization/me` return successful authenticated responses;
- unauthenticated foundation and authorization APIs remain protected;
- no Task #01 data or audit history was lost during the tested upgrade path.

## Build and runtime evidence

Passed:

```text
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck:libs
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/nexus-fm run build
```

Runtime verification after workflow restart:

- API workflow running;
- NEXUS-FM web workflow running;
- no authorization-request `5xx`;
- no application runtime error in the final targeted retest.

Known non-blocking build notices:

- Vite source-map reporting notices in existing UI components;
- Vite bundle-size advisory;
- Clerk development-key warning in development.

These notices did not cause build, runtime, authentication, or authorization failures.

## Independent review

An architectural security review initially found authorization and migration-integrity blockers. Each blocker was fixed and re-reviewed.

Final review result:

```text
PASS — no critical/high blocker remains.
```

The review confirmed:

- deny-by-default and explicit-deny precedence;
- server-resolved foundation resource IDs;
- fail-closed unresolved operational objects;
- organization isolation;
- Platform Admin separation;
- independent service-layer admin authorization;
- terminal revocation under row locking;
- safe audit evidence;
- null-safe scoped-binding uniqueness;
- clean and legacy migration paths;
- strict baseline-adoption refusal boundaries.

## Lock statement

Task #02 is locked as the canonical authorization foundation for later NEXUS-FM modules.

Later tasks may add resource resolvers and domain-specific policy checks. They must not:

- rename or remove the seven canonical roles;
- bypass the central server evaluator;
- treat UI visibility as authorization;
- treat an unverified resource ID as proof of access;
- grant Platform Admin automatic operational access;
- reactivate a revoked binding;
- omit audit evidence for sensitive role-binding changes;
- weaken deny-by-default behavior.