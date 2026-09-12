# NEXUS-FM Task #02 — Verification Evidence

## Status

```text
Task #02 = IMPLEMENTED
Task #02 = VERIFIED
```

This document is intentionally limited to the current authorization
implementation. Future operational modules remain outside its scope.

## Current implementation

- Canonical seven-role registry and resource/action permission catalog.
- Additive role permissions, scoped user role bindings, and authorization
  audit records.
- Binding statuses are exactly `ACTIVE`, `SUSPENDED`, and `EXPIRED`.
- Permission replacement persists omitted canonical matrix capabilities as
  explicit `DENY` rows. Seed is idempotent and does not restore those denials.
- Explicit `DENY` takes precedence over every allow.
- Role policy replacement uses a UUID `policyVersion` and an exact `If-Match`
  (or body `policyVersion`) precondition. Missing preconditions return `428`;
  stale concurrent replacements return `409`.
- Binding mutations use a UUID binding `version` CAS token and return `409`
  when concurrent updates race.
- POST and PATCH share complete binding-state validation. A merged PATCH state
  rejects missing object/assignment scope IDs, invalid dates, reversed date
  ranges, already-ended `ACTIVE` bindings, and non-terminal `EXPIRED`
  bindings before mutation or configuration audit. Expired-binding
  reactivation remains a `409`.
- Organization bindings do not satisfy facility/building/space/asset,
  assignment, team, or vendor-assignment defaults. Operational scope requires
  a compatible explicit binding and trusted verified server context.
- The evaluator independently rejects malformed legacy bindings. Hierarchical,
  assignment, team, owned-request, and vendor-assignment checks require the
  persisted binding scope ID to match trusted server-resolved context.
- Vendor-assignment access requires both a verified actor/vendor relationship
  and an exact assignment ID match; neither condition substitutes for the
  other.
- `/me/permissions` and `/me/scope` are restricted to the active organization.
- Permission introspection applies the same default-scope/binding-scope
  intersection as authorization, suppresses narrower operational defaults
  under an organization-only binding, and suppresses explicit denies.
- Production `/authorization/check` is disabled with `404`.
- Router production behavior defaults to the existing Clerk-backed
  `currentUser`; tests use only the dependency-injectable router factory.
- No operational domain modules or object resolvers were fabricated.

## Migration chain

The committed chain is:

1. `0000_gray_zemo.sql` — Task #01 foundation baseline.
2. `0001_needy_red_wolf.sql` — original additive authorization tables.
3. `0002_spooky_satana.sql` — null-safe binding uniqueness.
4. `0003_adopt_current_authorization.sql` — forward adoption/convergence:
   active foundation columns, authorization role registry and role foreign
   keys, current enum names and columns, policy/binding CAS versions,
   canonical audit columns, and the current role-permission/binding
   constraints.

The forward migration preserves old authorization rows where possible. Legacy
terminal binding rows are mapped to current `EXPIRED`; the current schema has
only `ACTIVE`, `SUSPENDED`, and `EXPIRED`. The migration does not add startup
DDL or a production migration runner.

The baseline adopter remains a separate controlled operation. It validates a
Task #01-shaped public schema, refuses incompatible relations, types,
columns, constraints, indexes, pre-existing authorization objects, or
non-empty migration history, and records only the foundation migration hash.

## Isolated migration verification

Command:

```text
pnpm --filter @workspace/db run test:migrations
```

Result:

```text
MIGRATION_AUTHORIZATION_CHECK_PASS:empty
MIGRATION_AUTHORIZATION_CHECK_PASS:task01-adopted
```

The script creates two disposable PostgreSQL databases from `DATABASE_URL`
and drops both in `finally` blocks. It never resets or truncates the live
database.

- **Empty target:** applies all four migrations; verifies current columns,
  role foreign keys, enum/status shape, policy and binding CAS columns,
  `UNIQUE NULLS NOT DISTINCT`, canonical role seed, representative
  authorization join, explicit deny persistence, and duplicate binding
  rejection.
- **Task #01-shaped target:** applies only the foundation baseline, runs
  `adopt-foundation-baseline.mjs`, applies authorization migrations, and runs
  the same current-schema and authorization checks.

The existing adoption refusal suite remains available:

```text
pnpm --filter @workspace/db run test:migrate-adoption
```

## Authorization and route verification

Command:

```text
pnpm --filter @workspace/api-server run test
```

Result:

```text
15 tests passed
0 failed
```

The suite uses real PostgreSQL fixtures. Its route test mounts
`createAuthorizationRouter` on Express, starts a real HTTP server, and uses
Node `fetch`. Coverage includes:

- canonical catalog and all seven roles;
- unknown/resource-mismatch, organization, lifecycle, explicit-deny,
  technician, vendor, platform, and diagnostic-context checks;
- durable omitted-capability denial after a forced catalog seed;
- permissions/roles/role-permissions reads and replacement;
- missing `428` and stale/concurrent `409` policy CAS behavior;
- binding list/create/duplicate/PATCH/DELETE, self-mutation denial,
  cross-organization denial, and concurrent binding CAS;
- service and HTTP PATCH rejection regression coverage for all
  `FACILITY`/`BUILDING`/`SPACE`/`ASSET`/`ASSIGNED`/`TEAM`/
  `VENDOR_ASSIGNMENT`/`OWNED_REQUEST` null scopes, invalid date/lifecycle
  states, unchanged binding rows, and unchanged binding-configuration audit;
- active-organization `/me/permissions` and `/me/scope` isolation;
- organization-only Facility Manager introspection excludes facility/work
  capabilities, a compatible facility binding exposes them at facility scope,
  and an explicit deny removes them again;
- directly persisted legacy null-scope bindings grant no evaluator or
  introspection authority;
- vendor actor proof with an assignment ID outside the binding returns
  `SCOPE_MISMATCH`;
- production authorization-probe `404`;
- audit sanitization and concurrent foundation bootstrap.

## Build and generation checks

Completed successfully:

```text
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run build
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/nexus-fm run build
```

The web build reports only existing source-map and chunk-size warnings.
`drizzle-kit check` reports `Everything's fine`.

The API test command now bundles `pg` while resolving external packages from
disposable `/tmp` test directories. It does not create or modify a workspace
`node_modules` symlink.

The non-interactive `drizzle-kit push` command still stops at Drizzle's
destructive truncate confirmation for the existing binding uniqueness
reconciliation. It was not forced. The live schema was not reset; direct
PostgreSQL inspection confirms the current null-safe constraint and CAS
columns. Clean and adopted database verification instead uses the committed
forward migration chain through `drizzle-kit migrate`.

## Task #01 regression and final review

The prior service-level foundation bootstrap/session regression and the
previous Clerk integration evidence passed login/logout, protected-shell
navigation, session persistence, authenticated APIs, and anonymous denial.
After the rebased migration work, both workflows were restarted cleanly;
`/api/healthz` returned `200`, while anonymous `/api/session` and
`/api/me/permissions` returned `401`.

Future Facility, Asset, Inspection, Work Order, Project, Finance, Compliance,
and nested/list/search/export endpoint checks are not applicable because
those modules do not exist.

Final architecture/security review found no blocker or high-severity issue.
It confirmed that both migration paths converge to the runtime schema and
approved transition through `EVIDENCE REVIEW → VERIFIED`.

`STABLE` and `LOCKED` remain separate subsequent governance transitions.