# NEXUS-FM — REPLIT IMPLEMENTATION PROMPT

## TASK #02 — AUTHORIZATION & PERMISSION MATRIX v1.0

Copy this prompt into the NEXUS-FM project after Task #01 has been audited and confirmed stable.

---

## ROLE

You are implementing **Task #02 — Authorization & Permission Matrix** for NEXUS-FM.

You must work additively and preserve Task #01:

> Foundation & Authentication v1.0 is locked.

Your job is to build the server-enforced authorization/control layer on top of the existing authentication, session, organization, and application-shell foundation.

Do not build a dashboard, Facility module, Asset module, Inspection module, Work Order module, Project module, Finance module, or AI feature in this task.

---

## NON-NEGOTIABLE GOVERNANCE

Follow this sequence:

```text
INSPECT
→ FREEZE BASELINE
→ PLAN
→ IMPLEMENT ADDITIVELY
→ TYPECHECK
→ TEST
→ VERIFY
→ RECONCILE
→ STABILIZE
→ LOCK
```

Before changing code:

1. inspect the current project structure;
2. inspect Task #01 database schema and migrations;
3. inspect authentication and session handling;
4. inspect organization context;
5. inspect existing role storage;
6. inspect protected routes and API middleware;
7. inspect package scripts and current runtime status;
8. record the baseline before making changes.

Do not rewrite stable code merely to use a preferred architecture.

---

## ROLE RECONCILIATION — IMPORTANT

Task #01 is locked and its canonical roles must not be renamed or replaced.

Use these role codes as the active Task #02 foundation:

```text
PLATFORM_ADMIN
FACILITY_MANAGER
FACILITY_SUPERVISOR
INSPECTOR
MAINTENANCE_TECHNICIAN
WAREHOUSE_SUPERVISOR
VENDOR
```

The following conceptual roles may be recorded as future extensions, but must not replace the active Task #01 roles:

```text
OWNER_MANAGEMENT
ENGINEERING_MANAGER
TENANT_USER
AUDITOR
FINANCE
SAFETY
SYSTEM_ADMIN
```

Conceptual mapping:

```text
SUPERVISOR          → FACILITY_SUPERVISOR
TECHNICIAN          → MAINTENANCE_TECHNICIAN
VENDOR_CONTRACTOR   → VENDOR
OWNER_MANAGEMENT    → FUTURE ROLE, not active in Task #02
ENGINEERING_MANAGER → FUTURE ROLE, not active in Task #02
TENANT_USER         → FUTURE ROLE, not active in Task #02
```

Do not modify Task #01 to introduce a second incompatible role vocabulary.

---

## OBJECTIVE

Implement an authorization engine that can determine:

```text
who
may perform what action
on which resource/object
within which organization and scope
under which conditions
```

Canonical model:

```text
USER
 ↓
ROLE
 ↓
PERMISSION
 ↓
RESOURCE
 ↓
ACTION
 ↓
OBJECT
 ↓
SCOPE
 ↓
DECISION
```

Example:

```text
MAINTENANCE_TECHNICIAN
 → WORK_ORDER.EXECUTE
 → assigned Work Order
 → ASSIGNED scope
 → ALLOW
```

The same technician attempting to execute another technician's Work Order must receive `DENY`.

---

## SECURITY INVARIANTS

These rules are mandatory:

1. Deny by default.
2. Server authorization is the security boundary.
3. UI guards are convenience only.
4. Organization isolation is mandatory.
5. Scope must be verified through database relationships.
6. Missing role, permission, or scope means deny.
7. Expired or suspended role bindings mean deny.
8. `PLATFORM_ADMIN` is not an operational superuser.
9. Direct object endpoints must enforce the same scope as list endpoints.
10. Authorization decisions must not bypass domain state rules.

Never implement:

```text
if permission missing:
    allow()
```

Never trust these values from the client without server verification:

```text
organizationId
roleId
scopeId
resourceId
action
```

---

## PERMISSION FORMAT

Use machine-readable identifiers:

```text
RESOURCE.ACTION
```

Canonical actions:

```text
VIEW
CREATE
UPDATE
DELETE
ASSIGN
EXECUTE
SUBMIT
APPROVE
VERIFY
CLOSE
MANAGE
EXPORT
VIEW_AUDIT
```

Canonical resources:

```text
ORGANIZATION
USER
ROLE
PERMISSION
SESSION
AUDIT_LOG
FACILITY
BUILDING
SPACE
SYSTEM
ASSET
INSPECTION
FINDING
ISSUE
INCIDENT
WORK_REQUEST
WORK_ORDER
EVIDENCE
VERIFICATION
PROJECT
DOCUMENT
COMPLIANCE
VENDOR
CONTRACT
BUDGET
COST
REPORT
NOTIFICATION
```

Define the catalog as canonical seed/configuration data. Do not accept arbitrary permission strings created by the client.

Permission for a domain that does not exist yet is a **reserved contract**, not an implemented feature.

---

## SCOPE MODEL

Implement or prepare these scope types:

```text
PLATFORM
ORGANIZATION
PORTFOLIO
FACILITY
BUILDING
SPACE
ASSET
ASSIGNED
TEAM
VENDOR_ASSIGNMENT
OWNED_REQUEST
```

The following relationships must be supported when the domain entities exist:

```text
FACILITY
 → BUILDING
   → FLOOR
     → ZONE
       → SPACE
         → SYSTEM
           → ASSET
             → WORK_ORDER
```

A user with `FACILITY` scope may access child objects only if the server verifies the parent relationship and organization relationship in the database.

Object ID matching alone is never sufficient.

---

## DATABASE CHANGES

Inspect the Task #01 schema first. Reuse existing tables where possible.

Add only the minimum additive structures required:

### `permissions`

```text
id
code                 unique
resource
action
description
status               ACTIVE | DEPRECATED
createdAt
updatedAt
```

### `role_permissions`

```text
id
roleId
permissionId
defaultScopeType
effect               ALLOW | DENY
createdAt
updatedAt
```

### Role binding scope

If Task #01 already has `user_roles`, extend it compatibly or add a related table:

```text
id
userId
organizationId
roleId
scopeType
scopeId              nullable where appropriate
status               ACTIVE | SUSPENDED | EXPIRED
startsAt             nullable
endsAt               nullable
grantedBy
createdAt
updatedAt
```

Do not destructively replace Task #01 tables.

Required integrity:

- organization must match the user membership;
- active binding is required;
- expired/suspended binding is rejected;
- duplicate bindings are prevented;
- `scopeId` is validated when the scope requires an object;
- permission and role codes are seeded idempotently.

---

## CENTRAL AUTHORIZATION SERVICE

Create one central evaluator. Do not duplicate the complete matrix in every route.

Conceptual interface:

```ts
authorize({
  userId,
  organizationId,
  resource,
  action,
  resourceId,
  context
})
```

Recommended result:

```ts
{
  allowed: boolean,
  reasonCode: string,
  permission?: string,
  scope?: string
}
```

Evaluation order:

```text
1. authentication
2. active user
3. active organization
4. organization membership/isolation
5. active role binding
6. permission grant
7. resource existence
8. object ownership/scope
9. explicit deny
10. domain state rule
11. final decision
```

Reason codes must be stable:

```text
AUTH_REQUIRED
USER_INACTIVE
ORGANIZATION_MISMATCH
ROLE_NOT_ASSIGNED
BINDING_INACTIVE
PERMISSION_NOT_GRANTED
RESOURCE_NOT_FOUND
SCOPE_DENIED
ASSIGNMENT_REQUIRED
OWNERSHIP_REQUIRED
VENDOR_SCOPE_DENIED
EXPLICIT_DENY
POLICY_DENIED
PERMISSION_GRANTED
```

Do not expose sensitive authorization internals to untrusted clients. Use safe public HTTP responses and server logs for detail.

---

## PLATFORM ADMIN RULE

`PLATFORM_ADMIN` may manage foundation/platform resources according to explicit permissions:

```text
ORGANIZATION.MANAGE
USER.MANAGE
ROLE.MANAGE
PERMISSION.MANAGE
AUDIT_LOG.VIEW_AUDIT
```

It must not automatically receive:

```text
FACILITY.UPDATE
ASSET.UPDATE
WORK_ORDER.EXECUTE
WORK_ORDER.VERIFY
WORK_ORDER.CLOSE
PROJECT.APPROVE
```

Operational authority must come from an explicit operational role binding.

---

## INITIAL ROLE CAPABILITY CONTRACT

Implement the permission catalog and role bindings for the active foundation roles. Use scope restrictions wherever the object domain exists.

### `FACILITY_MANAGER`

Default capability:

```text
facility-wide within assigned facility scope
```

Expected capabilities:

```text
VIEW facility/asset/inspection/finding/issue/work/project/document
CREATE and UPDATE operational records where domain is available
ASSIGN work and issue ownership
APPROVE relevant work/project decisions
VIEW and EXPORT reports/costs within scope
```

### `FACILITY_SUPERVISOR`

Default capability:

```text
team/operational scope
```

Expected capabilities:

```text
VIEW operational objects
CREATE and UPDATE inspection/issue/work records
ASSIGN work
EXECUTE permitted operational work
VERIFY completed work
CLOSE only after verification/domain rules pass
```

### `INSPECTOR`

Default capability:

```text
assigned inspection/facility scope
```

Expected capabilities:

```text
VIEW facility/asset context
CREATE and EXECUTE assigned inspections
CREATE and UPDATE findings
SUBMIT inspection results and evidence
```

Inspector must not automatically verify or close maintenance work.

### `MAINTENANCE_TECHNICIAN`

Default capability:

```text
assigned work/team scope
```

Expected capabilities:

```text
VIEW assigned work
EXECUTE assigned work
CREATE/UPDATE work evidence
SUBMIT completion
```

Technician must not verify or close their own work by default.

### `WAREHOUSE_SUPERVISOR`

Default capability:

```text
assigned warehouse/building scope
```

Expected capabilities:

```text
VIEW and UPDATE warehouse operational objects
CREATE issues/findings/work requests
ASSIGN and VERIFY work within scope
```

### `VENDOR`

Default capability:

```text
explicit vendor assignment scope
```

Expected capabilities:

```text
VIEW assigned work/project/document scope
EXECUTE assigned work
CREATE and SUBMIT evidence
```

Vendor must not view unrelated work, internal audit, other vendors, or full internal contracts.

---

## SEPARATION OF DUTIES

The authorization layer must support, but not fully implement every domain workflow:

```text
EXECUTE ≠ VERIFY ≠ CLOSE
```

Minimum rule:

```text
MAINTENANCE_TECHNICIAN:
  EXECUTE = allow
  VERIFY = deny
  CLOSE   = deny
```

Supervisor may verify and close only when domain state permits it.

The stronger rule:

```text
executor != verifier
```

is a domain policy to be enforced when Work Order and Verification engines are implemented. Prepare the authorization contract without inventing a non-existent workflow.

---

## API REQUIREMENTS

All protected endpoints must be authenticated, organization-scoped, and server-authorized.

Minimum introspection:

```text
GET /api/auth/me
GET /api/auth/me/permissions
GET /api/auth/authorization
```

Minimum administration:

```text
GET    /api/auth/permissions
GET    /api/auth/roles
GET    /api/users/:userId/role-bindings
POST   /api/admin/role-bindings
PATCH  /api/admin/role-bindings/:id
DELETE /api/admin/role-bindings/:id
```

Only users with explicit administrative permission may manage role bindings.

HTTP behavior:

```text
401 = unauthenticated
403 = authenticated but unauthorized
404 = resource absent, or intentionally hidden to prevent enumeration
```

Never allow a direct object endpoint to bypass list scope:

```text
GET /api/work-orders/:id
```

must perform the same organization and object-scope checks as the Work Order list.

---

## AUDIT REQUIREMENTS

Record authorization-sensitive events:

```text
ROLE_ASSIGNED
ROLE_REVOKED
PERMISSION_CHANGED
AUTHORIZATION_DENIED
SENSITIVE_ACTION_EXECUTED
```

Minimum audit fields:

```text
timestamp
actorUserId
organizationId
role
resource
action
resourceId
decision
reasonCode
request/context identifier
```

Audit records must be append-oriented. Do not store passwords, tokens, session secrets, or unnecessary sensitive payloads.

---

## TEST REQUIREMENTS

Tests must call the API/service layer directly, not only click through the UI.

Required scenarios:

### Authentication and regression

```text
anonymous request → 401
valid session → authorization continues
login/logout/session persistence → Task #01 behavior unchanged
```

### Organization isolation

```text
same organization and valid scope → eligible
different organization → DENY
client-supplied organizationId mismatch → DENY
```

### Role and permission

```text
assigned role → evaluate
missing role → DENY
permission exists → continue
permission missing → DENY
unknown permission → DENY
```

### Object scope

```text
within facility scope → ALLOW
outside facility scope → DENY
valid inherited child object → eligible
unverified parent relation → DENY
```

### Assignment

```text
assigned technician → ALLOW
unassigned technician → DENY
assigned vendor → ALLOW
unrelated vendor → DENY
```

### Platform admin

```text
platform administration → ALLOW where explicitly permitted
operational action without operational role → DENY
```

### Bypass

```text
hidden UI button + direct API call → still DENY
direct object endpoint outside scope → DENY or safe 404
```

Quality gates:

```text
typecheck
build
migration
seed
Task #01 regression tests
cross-organization tests
role isolation tests
scope inheritance tests
```

---

## DEFINITION OF DONE

Do not report `VERIFIED` until all are true:

- permission catalog exists;
- active Task #01 roles remain unchanged;
- role-permission bindings are evaluable;
- scope bindings work;
- organization isolation works;
- deny-by-default works;
- server enforcement works without UI;
- central evaluator is used;
- reason codes are consistent;
- direct API authorization tests pass;
- platform admin has no automatic operational privilege;
- vendor and technician assignment isolation pass;
- authorization-sensitive audit events work;
- Task #01 regression tests pass;
- typecheck passes;
- build passes;
- migration and seed pass;
- no destructive Task #01 change was made.

---

## FORMAL VERIFICATION GATE

Do not treat implementation completion, code merge, or UI behavior as verification.

Run and record evidence for every gate:

| Gate | Required result |
|---|---|
| Same-organization authorized access | `ALLOW` |
| Same-organization unauthorized action | `DENY` |
| Cross-organization read | `DENY` or safe `404` |
| Cross-organization mutation | `DENY` |
| Assigned object access | `ALLOW` according to permission |
| Unassigned object access | `DENY` |
| Direct-API bypass | `DENY` |
| Frontend bypass attempt | `DENY` server-side |
| Separation-of-duties conflict | `DENY` |
| Authorization audit event | Recorded |
| Additive migration on clean database | `PASS` |
| Additive migration on existing Task #01 database | `PASS` |
| Deterministic/idempotent seed | `PASS` |
| Production build | `PASS` |
| Task #01 regression | `PASS` |
| Full authorization regression | `PASS` |

Cross-organization isolation must cover more than a single detail route. Test:

```text
detail
list
filter
search
pagination
export
nested/child endpoints
direct object IDs
all available mutation paths
```

Assignment scope must be evaluated consistently on every available endpoint. A broad role permission must never bypass an assignment restriction.

There is no partial pass sufficient for `VERIFIED`.

If any of these fails:

```text
cross-organization isolation
assignment scope
direct-API authorization
migration
seed
production build
Task #01 regression
```

the required status is:

```text
NOT VERIFIED
```

Perform an isolated fix, rerun the failed gate, then rerun the full authorization suite and Task #01 regression suite.

`VERIFIED` means:

```text
implementation
+ integration
+ adversarial authorization testing
+ recorded regression evidence
```

---

## STATUS TRANSITION

```text
IMPLEMENTATION
 ↓
INTEGRATION
 ↓
ADVERSARIAL TESTING
 ↓
REGRESSION
 ↓
EVIDENCE REVIEW
 ↓
VERIFIED
 ↓
STABLE
 ↓
LOCKED
```

If any critical gate fails:

```text
ANY CRITICAL FAILURE
 ↓
NOT VERIFIED
 ↓
ISOLATED FIX
 ↓
RE-RUN TASK #02 REGRESSION
 ↓
RE-RUN TASK #01 REGRESSION
 ↓
EVIDENCE REVIEW
```

Do not fix a Task #02 issue by modifying Task #01 unless a verified regression requires a backward-compatible correction.

Never use any of these shortcuts:

```text
"mostly passed" → VERIFIED
"build passed" → VERIFIED
"unit tests passed" → VERIFIED
"UI works" → VERIFIED
"API works" → VERIFIED
```

---

## FINAL REPORT

At completion, report:

```text
TASK
Task #02 — Authorization & Permission Matrix

STATUS
RUNNING | IMPLEMENTED | VERIFIED | STABLE | BLOCKED

BASELINE AUDIT
- Task #01 status:
- Auth/session:
- Organization context:
- Existing roles:
- Existing migrations:
- Existing protected routes:

CHANGES
- Permission catalog:
- Role-permission bindings:
- Scope model:
- Authorization evaluator:
- Middleware:
- API:
- Audit:

DATABASE
- ...

ROUTES
- ...

TESTS
- Passed:
- Failed:
- Not run:

SECURITY
- Cross-organization isolation:
- Scope enforcement:
- Platform admin separation:
- Direct API bypass:

REGRESSION
- Task #01 affected: YES/NO
- Details:

ISSUES
- ...

NEXT TASK
Task #03 — Facility & Space
```

Do not claim `IMPLEMENTED`, `VERIFIED`, or `STABLE` based on UI work alone.

**Build the authorization/control layer only. Preserve Task #01. Do not expand scope.**