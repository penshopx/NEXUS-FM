# TATABANGUN

TATABANGUN — Sistem Tata Kelola Gedung, Gudang, dan Infrastruktur.
Tagline: Kelola fasilitasnya. Pastikan kompetensinya. Buktikan kepatuhannya.

## Product rules

- Facility-first and asset-centric.
- Bahasa Indonesia is the required language for all app-owned user-facing copy, including navigation, forms, tables, dialogs, errors, empty states, exports, and accessibility text. Keep product names, identifiers, API values, and technical terms unchanged when translating them would reduce correctness.
- Completed work is not automatically verified or closed.
- A critical issue takes precedence over average scores.
- Business rules belong in service/domain modules, not route handlers or UI components.
- Important state changes require an audit trail.
- AI may recommend actions but must not make operational decisions.

## Current implementation boundary

Task #01 is verified, stable, and locked. It covers the application shell, Clerk authentication/session handling, organization context, canonical roles, protected routes, and audit-ready foundation data.

Task #02 is verified, stable, and locked. It covers the canonical permission catalog, role capability matrix, scoped role bindings, central server authorization evaluator, admin binding APIs, audit evidence, and additive migrations.

Operational modules are not implemented yet. Their reserved permissions remain fail-closed until a later task adds server-side resource and relationship resolvers.

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

Authorization-sensitive routes must call the central evaluator or an authorization service that does so internally. UI visibility is never an authorization boundary.