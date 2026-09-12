# NEXUS-FM Task #02 — Verification Evidence

## Status

```text
Task #02 = IMPLEMENTED
Task #02 = VERIFIED
```

This document covers the authorization foundation and the Task #02
organization-scoped facility registry.

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
- Facility, building, space, system, and asset records are organization
  scoped. Composite organization-plus-ancestor foreign keys prevent a row
  from pointing at a parent in another organization or at a mismatched
  ancestor.
- Trusted server-side resolvers load every persisted ancestor before creating
  verified authorization context. Missing, cross-organization, and malformed
  ancestor chains fail closed.
- Registry routes cover list, detail, name/code search, pagination, nested
  access, CSV export, and create/update/delete mutations. Every surface
  filters by active organization and evaluates the resolved ancestor context
  against the actor's persisted binding.
- Facility registration has a narrowly scoped bootstrap rule: an
  organization binding may satisfy `FACILITY.CREATE` for a new facility.
  The same binding cannot view, update, or delete an existing facility;
  those operations still require an explicit compatible facility binding.
- Registry mutations resolve and lock the trusted object, evaluate
  authorization against the same transaction connection, write, and append
  successful mutation audit records atomically. Decision audits use that same
  transaction connection, so both the decision and mutation-success audit
  roll back together if the write fails.
- Authorization row locks use a fixed order (user, organization, membership,
  bindings, roles, role permissions, permissions) with deterministic key
  ordering.

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
5. `0004_facility_registry.sql` — organization-scoped facilities, buildings,
   spaces, systems, and assets with composite ancestor foreign keys,
   organization indexes, and parent identity uniqueness constraints.

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
  the same current-schema, authorization, and registry checks.

The migration assertions also insert a complete facility → building → space →
system → asset chain and verify that a cross-ancestor space insert fails with
PostgreSQL `23503`.

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
18 tests passed
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
- real facility/building/space/system/asset rows and complete trusted ancestor
  context;
- list filtering and pagination, search, detail, nested listing/creation,
  CSV export, update, and create mutation routes;
- same-organization outside-facility denial, cross-organization `404`
  isolation, tampered child-parent rejection, and database-level composite
  ancestor FK rejection;
- organization bootstrap `FACILITY.CREATE` allow with explicit existing
  facility VIEW/UPDATE/MANAGE denials.
- table-driven adversarial HTTP coverage for FACILITY, BUILDING, SPACE, and
  ASSET bindings across rows/totals/pages, search, CSV, detail, nested,
  create, update, and delete surfaces, including pagination boundaries and
  same/cross-organization exclusions.
- deterministic transaction-lock concurrency coverage proving revocation and
  policy DENY wait for a mutation's authorization/write transaction and deny
  only on the subsequent authorization.

## Build and generation checks

Completed successfully:

```text
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck:libs
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/db exec drizzle-kit check --config ./drizzle.config.ts
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run build
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/nexus-fm run build
```

The web build reports only existing source-map and chunk-size warnings.
`drizzle-kit check` reports `Everything's fine`.

The aggregate `pnpm run typecheck` remains blocked by pre-existing
`nexus-fm-animated-film` DOM/video TypeScript errors; the changed DB and API
packages pass their focused checks above.

The full API suite, including the focused registry test, was executed against
a disposable database after
`drizzle-kit migrate`:

```text
18 tests passed, 0 failed
```

The API test command bundles `pg` while resolving external packages from
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

Future Inspection, Work Order, Project, Finance, and Compliance modules remain
outside this task. Facility registry list/search/export/nested endpoint checks
are covered by the focused test above.

Final architecture/security review found no blocker or high-severity issue.
It confirmed that both migration paths converge to the runtime schema and
approved transition through `EVIDENCE REVIEW → VERIFIED`.

`STABLE` and `LOCKED` remain separate subsequent governance transitions.