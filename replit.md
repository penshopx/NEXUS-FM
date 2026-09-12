# NEXUS-FM

NEXUS-FM is an evidence-based facility management operating system.

## Product rules

- Facility-first and asset-centric.
- Completed work is not automatically verified or closed.
- A critical issue takes precedence over average scores.
- Business rules belong in service/domain modules, not route handlers or UI components.
- Important state changes require an audit trail.
- AI may recommend actions but must not make operational decisions.

## Current implementation boundary

Task #01 covers the application shell, Clerk authentication/session handling, organization context, canonical roles, minimum RBAC, protected routes, and audit-ready foundation data.

Do not add operational modules or begin the full Task #02 permission matrix until Task #01 is verified and stable.

Canonical roles:

- `PLATFORM_ADMIN`
- `FACILITY_MANAGER`
- `FACILITY_SUPERVISOR`
- `INSPECTOR`
- `MAINTENANCE_TECHNICIAN`
- `WAREHOUSE_SUPERVISOR`
- `VENDOR`

## Architecture

- React + Vite frontend: `artifacts/nexus-fm`
- Express API: `artifacts/api-server`
- OpenAPI source of truth: `lib/api-spec/openapi.yaml`
- PostgreSQL + Drizzle schema: `lib/db/src/schema`
- Generated Zod contracts and React Query hooks live under `lib/api-zod` and `lib/api-client-react`.

Implement API changes contract-first: update OpenAPI, run codegen, then implement the server and frontend consumers.