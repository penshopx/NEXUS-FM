# NEXUS-FM

## Task #02 — Authorization & Permission Matrix

**Specification v1.0**  
**Status:** IMPLEMENTATION / VERIFICATION GATE — NOT VERIFIED  
**Dependency:** Task #01 — Foundation & Authentication v1.0  
**Principle:** Additive, Isolated, Server-Enforced

---

## 1. Tujuan

Task #02 mengubah role dasar dari Task #01 menjadi model authorization yang dapat menjawab secara konsisten:

> **Siapa boleh melihat, membuat, mengubah, menjalankan, menyetujui, memverifikasi, atau menutup object tertentu dalam scope tertentu?**

Task ini membangun:

- permission catalog;
- role-to-permission matrix;
- object scope;
- assignment role terhadap organization dan object scope;
- server-side authorization evaluator;
- middleware/helper untuk route dan service;
- audit untuk keputusan authorization yang sensitif;
- test matrix untuk positive access, denied access, dan cross-organization isolation.

Task ini **tidak** membangun modul Facility, Asset, Inspection, Work Order, Project, Finance, atau Compliance. Permission untuk domain tersebut boleh didefinisikan sebagai kontrak agar task berikutnya konsisten, tetapi enforcement hanya dilakukan pada resource yang sudah tersedia.

---

## 2. Invariants yang Tidak Boleh Berubah

### 2.1 Task #01 tetap menjadi fondasi

Jangan mengubah:

- login/logout;
- session contract;
- organization context;
- canonical role code;
- protected application shell;
- migration yang sudah stabil.

Perubahan terhadap Task #01 hanya boleh berupa additive migration atau adapter yang kompatibel.

### 2.2 Server adalah sumber keputusan

UI boleh menyembunyikan tombol, tetapi UI tidak pernah menjadi security boundary.

Setiap action yang sensitif harus diperiksa kembali di server:

```text
request
→ authenticated session
→ active user
→ organization context
→ role binding
→ object scope
→ permission
→ domain state rule
→ allow / deny
```

Permission yang lolos tetap tidak boleh melewati state machine domain. Contoh: user yang boleh `VERIFY` tetap tidak dapat memverifikasi Work Order yang belum berstatus `VERIFICATION`.

### 2.3 Deny by default

Jika permission, role binding, organization membership, atau object scope tidak dapat dibuktikan, hasilnya adalah `DENY`.

Tidak boleh ada fallback:

```text
unknown role → admin
missing scope → all objects
unknown permission → allow
```

### 2.4 Platform Admin tidak otomatis memiliki seluruh data operasional

`PLATFORM_ADMIN` mengelola foundation dan konfigurasi platform. Role tersebut tidak otomatis memperoleh akses penuh terhadap Facility, Asset, Work, Cost, atau Project.

Jika seseorang perlu mengelola operasi fasilitas, ia harus memiliki role operasional yang sesuai. Ini menjaga pemisahan antara administrasi platform dan accountability operasional.

---

## 3. Canonical Roles

Task #02 menggunakan role yang sudah dikunci pada Task #01:

```text
PLATFORM_ADMIN
FACILITY_MANAGER
FACILITY_SUPERVISOR
INSPECTOR
MAINTENANCE_TECHNICIAN
WAREHOUSE_SUPERVISOR
VENDOR
```

Role berikut adalah **reserved untuk task mendatang** dan tidak diaktifkan sebagai operational role pada Task #02:

```text
OWNER
ENGINEERING_MANAGER
SAFETY_OFFICER
COMPLIANCE_OFFICER
FINANCE
VENDOR_MANAGER
TENANT
AUDITOR
```

Jangan mengubah tujuh canonical role menjadi `ADMIN` dan `USER`. Nama dan kode role harus tetap eksplisit.

---

## 4. Permission Model

### 4.1 Permission identifier

Format canonical:

```text
<RESOURCE>.<ACTION>
```

Contoh:

```text
FACILITY.VIEW
WORK_ORDER.ASSIGN
WORK_ORDER.VERIFY
AUDIT_LOG.VIEW
```

Permission adalah data terdaftar, bukan string bebas yang dibuat dari input client.

### 4.2 Action catalog

| Action | Makna |
|---|---|
| `VIEW` | membaca data |
| `CREATE` | membuat object baru |
| `UPDATE` | mengubah field yang diizinkan |
| `DELETE` | menghapus atau membatalkan object jika domain mengizinkan |
| `ASSIGN` | menetapkan owner, assignee, atau scope |
| `EXECUTE` | menjalankan pekerjaan/inspeksi yang ditugaskan |
| `SUBMIT` | mengirim hasil untuk review/verifikasi |
| `APPROVE` | menyetujui keputusan, pekerjaan, budget, atau project |
| `VERIFY` | memeriksa hasil dan menyatakan pass/fail |
| `CLOSE` | menutup lifecycle object |
| `MANAGE` | administrasi penuh atas resource sesuai scope |
| `EXPORT` | mengekspor data |
| `VIEW_AUDIT` | membaca audit record |

`DELETE` tidak boleh dipetakan ke hard delete secara otomatis. Setiap domain harus menentukan apakah action tersebut berarti archive, cancel, revoke, atau penghapusan permanen.

### 4.3 Resource catalog

Resource berikut didefinisikan sebagai kontrak lintas task:

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

Tidak semua resource harus memiliki seluruh action. Permission catalog harus hanya mendaftarkan kombinasi yang bermakna.

---

## 5. Scope Model

Authorization tidak cukup dengan role. Setiap role binding memiliki scope.

### 5.1 Canonical scope types

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

### 5.2 Makna scope

| Scope | Makna |
|---|---|
| `PLATFORM` | lintas organization, hanya untuk capability platform tertentu |
| `ORGANIZATION` | seluruh resource dalam satu organization |
| `PORTFOLIO` | facility di bawah portfolio tertentu |
| `FACILITY` | satu facility atau daftar facility |
| `BUILDING` | satu building atau struktur turunannya |
| `SPACE` | satu area/space dan object turunannya |
| `ASSET` | asset tertentu |
| `ASSIGNED` | object yang secara eksplisit ditugaskan kepada user |
| `TEAM` | object yang ditugaskan kepada team user |
| `VENDOR_ASSIGNMENT` | pekerjaan/project/document yang diberikan kepada vendor |
| `OWNED_REQUEST` | request yang dibuat atau dimiliki user |

Task #02 perlu menyiapkan struktur scope binding. `FACILITY`, `BUILDING`, `SPACE`, dan `ASSET` belum dapat digunakan penuh sampai entity terkait dibangun pada task berikutnya.

### 5.3 Scope inheritance

Scope dapat diwariskan ke child object bila hubungan parent-child telah diverifikasi oleh server:

```text
FACILITY
  → BUILDING
    → SPACE
      → SYSTEM
        → ASSET
```

Inheritance tidak boleh didasarkan hanya pada `facilityId` dari request. Server harus memuat object dan memverifikasi ancestor relationship.

### 5.4 No scope escalation

User yang memiliki akses ke satu Facility tidak otomatis boleh:

- melihat Facility lain;
- melihat organization lain;
- mengubah role binding;
- memperluas scope dirinya sendiri;
- membaca object yang hanya ditugaskan ke vendor lain.

---

## 6. Data Model Tambahan

### 6.1 `permissions`

```text
id
code                 unique, e.g. WORK_ORDER.VERIFY
resource
action
description
status               ACTIVE | DEPRECATED
createdAt
updatedAt
```

### 6.2 `role_permissions`

```text
id
roleId
permissionId
defaultScopeType
effect               ALLOW | DENY
createdAt
updatedAt
```

Unique constraint:

```text
(roleId, permissionId, defaultScopeType)
```

### 6.3 `user_role_bindings`

Jika `user_roles` dari Task #01 sudah digunakan, jangan menggantinya secara destruktif. Tambahkan binding scope melalui migration additive atau perluas tabel dengan backward-compatible fields.

Kontrak konseptual:

```text
id
userId
organizationId
roleId
scopeType
scopeId              nullable untuk PLATFORM/ORGANIZATION
status               ACTIVE | SUSPENDED | EXPIRED
startsAt             nullable
endsAt               nullable
grantedBy
createdAt
updatedAt
```

Constraint penting:

- `organizationId` wajib sesuai dengan organization user;
- `scopeId` harus merujuk ke object yang valid ketika scope membutuhkannya;
- binding yang expired atau suspended tidak berlaku;
- user tidak boleh mengaktifkan binding untuk dirinya sendiri tanpa permission administrasi yang sesuai.

### 6.4 `authorization_audit_logs` — optional additive

Jika audit engine Task #01 sudah memiliki struktur yang cukup, gunakan struktur tersebut. Jika belum, authorization event sensitif minimal dapat dicatat sebagai:

```text
id
organizationId
actorUserId
action
resource
resourceId
decision             ALLOW | DENY
reasonCode
scopeEvaluated
createdAt
```

Jangan mencatat password, token, session secret, atau data sensitif yang tidak diperlukan.

---

## 7. Role-to-Permission Matrix

Legenda:

```text
V = VIEW
C = CREATE
U = UPDATE
A = ASSIGN
X = EXECUTE
S = SUBMIT
P = APPROVE
Y = VERIFY
L = CLOSE
M = MANAGE
E = EXPORT
- = tidak diberikan
```

Matrix berikut adalah default permission. Object scope tetap wajib diterapkan.

### 7.1 Foundation resources

| Resource | Platform Admin | Facility Manager | Supervisor | Inspector | Technician | Warehouse Supervisor | Vendor |
|---|---|---|---|---|---|---|---|
| `ORGANIZATION` | M | V | - | - | - | - | - |
| `USER` | M | V | - | - | - | - | - |
| `ROLE` | M | - | - | - | - | - | - |
| `PERMISSION` | M | - | - | - | - | - | - |
| `SESSION` | M | V | V | V | V | V | V |
| `AUDIT_LOG` | VIEW_AUDIT, E | VIEW_AUDIT | VIEW_AUDIT* | - | - | VIEW_AUDIT* | - |

`*` hanya untuk event dan object dalam operational scope yang diberikan, setelah audit domain tersedia.

### 7.2 Facility dan Asset

| Resource | Platform Admin | Facility Manager | Supervisor | Inspector | Technician | Warehouse Supervisor | Vendor |
|---|---|---|---|---|---|---|---|
| `FACILITY` | - | V, U, M | V, U | V | V* | V, U | V* |
| `BUILDING` | - | V, C, U, M | V, C, U | V | V* | V, C, U | V* |
| `SPACE` | - | V, C, U, M | V, C, U | V | V* | V, C, U | V* |
| `SYSTEM` | - | V, C, U, M | V, C, U | V | V* | V, C, U | V* |
| `ASSET` | - | V, C, U, M | V, C, U, A | V, U* | V* | V, C, U, A | V* |

`*` dibatasi pada assigned/team/facility scope dan field yang relevan. Lifecycle deletion tidak diberikan sebagai hard delete default.

### 7.3 Inspection, Finding, Issue, Incident

| Resource | Platform Admin | Facility Manager | Supervisor | Inspector | Technician | Warehouse Supervisor | Vendor |
|---|---|---|---|---|---|---|---|
| `INSPECTION` | - | V, C, U, P | V, C, U, A, Y, L | V, C, U, X, S | V* | V, C, U, X, S | V* |
| `FINDING` | - | V, C, U, A, P, L | V, C, U, A, Y, L | V, C, U, S | V* | V, C, U, A, S | V* |
| `ISSUE` | - | V, C, U, A, P, L | V, C, U, A, L | V, C, U, S | V* | V, C, U, A, S | V* |
| `INCIDENT` | - | V, C, U, A, P, L | V, C, U, A, S, L | V, C, U, S | V* | V, C, U, A, S | - |

Vendor hanya boleh melihat issue/finding yang berhubungan dengan assignment aktif. Vendor tidak otomatis dapat melihat incident keselamatan internal.

### 7.4 Work, Evidence, Verification

| Resource | Platform Admin | Facility Manager | Supervisor | Inspector | Technician | Warehouse Supervisor | Vendor |
|---|---|---|---|---|---|---|---|
| `WORK_REQUEST` | - | V, C, U, P, L | V, C, U, A, L | V, C, S | V* | V, C, U, A, L | V* |
| `WORK_ORDER` | - | V, C, U, A, P, L | V, C, U, A, Y, L | V* | V*, X, S | V, C, U, A, Y, L | V*, X, S |
| `EVIDENCE` | - | V, C, U, Y | V, C, U, Y | V, C, U | V*, C, U, S | V, C, U, Y | V*, C, U, S |
| `VERIFICATION` | - | V, Y, L* | V, C, U, Y, L | V* | - | V, Y, L* | - |

`L*` hanya boleh menutup object setelah verification pass dan aturan domain menyatakan object siap ditutup.

### 7.5 Project, Document, Commercial

| Resource | Platform Admin | Facility Manager | Supervisor | Inspector | Technician | Warehouse Supervisor | Vendor |
|---|---|---|---|---|---|---|---|
| `PROJECT` | - | V, C, U, A, P, L | V, U, A | V* | V* | V, U* | V* |
| `DOCUMENT` | V* | V, C, U, M, E | V, C, U | V, C, U | V*, C* | V, C, U, E | V*, C*, S* |
| `COMPLIANCE` | - | V, C, U, P, L | V, U, S | V, C, U, S | V* | V, U, S | V* |
| `VENDOR` | M* | V, C, U, M | V* | - | - | V* | V* |
| `CONTRACT` | - | V, C, U, P, L | V* | - | - | V* | V* |

`*` ditentukan lagi oleh object relationship dan assignment. Vendor tidak boleh melihat kontrak internal penuh atau vendor lain.

### 7.6 Finance, Reporting, Notification

| Resource | Platform Admin | Facility Manager | Supervisor | Inspector | Technician | Warehouse Supervisor | Vendor |
|---|---|---|---|---|---|---|---|
| `BUDGET` | - | V, C, U, P, E | V* | - | - | V* | - |
| `COST` | - | V, C, U, E | V* | - | C* | V* | V* |
| `REPORT` | V* | V, C, E | V, C, E | V, C, E* | V* | V, C, E | V* |
| `NOTIFICATION` | V, U | V, U | V, U | V, U | V, U | V, U | V, U |

Finance access is intentionally narrow in this task. Full finance role and separation of duties are future work.

---

## 8. Permission Evaluation Contract

### 8.1 Input

Authorization evaluator menerima context terstruktur:

```ts
type AuthorizationRequest = {
  actorUserId: string;
  organizationId: string;
  permission: string;
  resourceType: string;
  resourceId?: string;
  actionContext?: Record<string, unknown>;
};
```

`organizationId` harus berasal dari authenticated server context. Nilai dari client hanya boleh dipakai sebagai filter kandidat, lalu diverifikasi terhadap session.

### 8.2 Output

```ts
type AuthorizationDecision = {
  allowed: boolean;
  reasonCode:
    | "ALLOWED"
    | "UNAUTHENTICATED"
    | "USER_INACTIVE"
    | "ORGANIZATION_MISMATCH"
    | "ROLE_MISSING"
    | "PERMISSION_MISSING"
    | "SCOPE_MISMATCH"
    | "BINDING_INACTIVE"
    | "DOMAIN_RULE_DENIED";
  permission: string;
  scopeType?: string;
};
```

Reason detail yang sensitif hanya ditulis ke server log/audit sesuai kebutuhan. Jangan membocorkan daftar role atau scope internal kepada attacker melalui response.

### 8.3 Evaluation order

```text
1. session valid?
2. user aktif?
3. organization aktif?
4. user termasuk organization tersebut?
5. role binding aktif?
6. role memiliki permission?
7. object berada dalam scope?
8. domain state mengizinkan action?
9. audit sensitive decision bila diperlukan
10. allow
```

### 8.4 Explicit deny

Jika sistem menggunakan `DENY` rule, precedence-nya:

```text
explicit deny
>
scope mismatch
>
missing allow
>
allow
```

Jangan menyelesaikan konflik permission dengan “role paling tinggi menang”. Tingkat hierarki role tidak boleh menjadi bypass.

---

## 9. Service dan Middleware Contract

Nama dapat mengikuti convention project, tetapi kemampuan berikut harus tersedia:

```text
requireAuthenticatedUser()
getAuthorizationContext()
authorize(request)
requirePermission(permission, resourceResolver?)
requireScope(resource)
assertOrganizationScope(resource)
```

Service domain harus memanggil authorization sebelum mutation:

```text
createWorkOrder()
  → authorize(WORK_ORDER.CREATE)
  → validate input
  → validate relationships
  → persist
  → audit
```

Bukan:

```text
UI hides button
  → API accepts mutation
```

---

## 10. Route dan API Contract

### Foundation administration

```text
GET   /api/permissions
GET   /api/roles/:roleId/permissions
PUT   /api/roles/:roleId/permissions
GET   /api/users/:userId/role-bindings
POST  /api/users/:userId/role-bindings
PATCH /api/users/:userId/role-bindings/:bindingId
```

Endpoint administrasi hanya dapat digunakan oleh `PLATFORM_ADMIN` atau role yang kelak diberi permission khusus `ROLE.MANAGE`/`USER.MANAGE`.

### Authorization introspection

```text
GET /api/me/permissions
GET /api/me/scope
```

Endpoint ini hanya untuk membantu UI membentuk navigasi/action state. Endpoint tersebut tidak menggantikan server authorization.

### Test/probe endpoint

Jika diperlukan untuk development:

```text
POST /api/authorization/check
```

Endpoint ini harus disabled atau dibatasi di production bila dapat membocorkan struktur permission. Ia tidak boleh menjadi endpoint mutation bypass.

---

## 11. Administrasi Permission

Untuk mencegah konfigurasi berbahaya:

- permission catalog canonical di-seed oleh migration/seed resmi;
- user tidak boleh menciptakan permission code bebas;
- perubahan role permission harus tervalidasi;
- perubahan terhadap `PLATFORM_ADMIN` harus diaudit;
- perubahan role binding harus mencatat actor, target, before, after, reason, dan timestamp;
- tidak boleh menghapus permission yang sedang digunakan; gunakan `DEPRECATED`;
- tidak boleh menghapus role canonical melalui UI biasa;
- perubahan access tidak boleh mengubah histori audit.

Jika belum ada UI admin yang aman, gunakan migration/seed yang terdokumentasi. Jangan membuat halaman konfigurasi yang terlihat lengkap tetapi tidak benar-benar enforce.

---

## 12. Acceptance Criteria

Task #02 dapat berstatus `VERIFIED` jika:

### Permission model

- canonical permission catalog tersedia;
- role permission matrix tersimpan;
- permission tidak berasal dari arbitrary client string;
- unknown permission menghasilkan deny;
- deny by default berjalan.

### Scope

- user hanya dapat menggunakan permission dalam organization aktif;
- role binding memiliki status dan lifecycle;
- expired/suspended binding ditolak;
- scope object diverifikasi server-side;
- cross-organization access ditolak;
- user tidak dapat memperluas scope dirinya sendiri.

### Enforcement

- protected API memakai authorization evaluator;
- route/UI hiding tidak menjadi satu-satunya protection;
- domain state rule tetap berjalan setelah permission lolos;
- `PLATFORM_ADMIN` tidak otomatis memperoleh akses operasional;
- vendor dibatasi pada assignment;
- technician dibatasi pada work yang ditugaskan;
- inspector dapat melakukan inspection/finding sesuai scope, tetapi tidak dapat memverifikasi pekerjaan tanpa permission;
- supervisor dapat melakukan verification sesuai scope;
- facility manager memiliki access decision/approval sesuai scope.

### Audit

- perubahan permission dan role binding tercatat;
- decision sensitif dapat ditelusuri;
- audit tidak dapat diubah dari route biasa;
- secret dan password tidak masuk audit payload.

### Regression

- login/logout/session Task #01 tetap bekerja;
- protected route Task #01 tetap bekerja;
- migration lama tidak rusak;
- role code canonical tidak berubah;
- tidak ada domain operasional palsu yang dinyatakan implemented.

---

## 13. Test Matrix

### 13.1 Foundation regression

| ID | Skenario | Expected |
|---|---|---|
| REG-01 | Login user aktif | Sukses |
| REG-02 | Logout | Session dicabut |
| REG-03 | Anonymous membuka protected route | Ditolak |
| REG-04 | Session expired | Ditolak |
| REG-05 | Role Task #01 dimuat | Tidak berubah |

### 13.2 Permission

| ID | Skenario | Expected |
|---|---|---|
| PERM-01 | Role memiliki `FACILITY.VIEW` | Akses diizinkan dalam scope |
| PERM-02 | Role tidak memiliki `WORK_ORDER.VERIFY` | Akses ditolak |
| PERM-03 | Unknown permission | Deny |
| PERM-04 | Client mengirim action berbeda dari route | Server memakai permission canonical |
| PERM-05 | UI menyembunyikan tombol, API dipanggil langsung | API tetap enforce |
| PERM-06 | Explicit deny rule | Deny mengalahkan allow |

### 13.3 Organization isolation

| ID | Skenario | Expected |
|---|---|---|
| SCOPE-01 | User A meminta resource organization B | Ditolak |
| SCOPE-02 | User A mengirim `organizationId` B | Ditolak |
| SCOPE-03 | Role binding organization mismatch | Ditolak |
| SCOPE-04 | Binding expired | Ditolak |
| SCOPE-05 | Binding suspended | Ditolak |
| SCOPE-06 | User mencoba membuat binding untuk dirinya | Ditolak kecuali explicitly allowed |

### 13.4 Role behavior

| ID | Skenario | Expected |
|---|---|---|
| ROLE-01 | Platform Admin membaca role/permission | Diizinkan |
| ROLE-02 | Platform Admin membuka work order operasional tanpa operational role | Ditolak |
| ROLE-03 | Facility Manager approve dalam facility scope | Diizinkan |
| ROLE-04 | Inspector membuat finding dalam assigned inspection | Diizinkan |
| ROLE-05 | Inspector verify work order | Ditolak secara default |
| ROLE-06 | Technician melihat work order milik technician lain | Ditolak |
| ROLE-07 | Technician submit evidence untuk assigned work | Diizinkan |
| ROLE-08 | Supervisor verify pekerjaan dalam scope | Diizinkan |
| ROLE-09 | Vendor melihat project milik vendor lain | Ditolak |
| ROLE-10 | Warehouse Supervisor mengakses warehouse di luar scope | Ditolak |

### 13.5 Audit and security

| ID | Skenario | Expected |
|---|---|---|
| AUDIT-01 | Role permission berubah | Audit before/after tercatat |
| AUDIT-02 | Role binding berubah | Actor, target, reason, timestamp tercatat |
| AUDIT-03 | Authorization denied | Decision dapat dilog sesuai policy |
| AUDIT-04 | Password/session secret masuk request | Tidak masuk audit |
| AUDIT-05 | Audit route dimodifikasi user biasa | Ditolak |

### 13.6 Engineering quality

| ID | Skenario | Expected |
|---|---|---|
| QA-01 | Migration dari database kosong | Sukses |
| QA-02 | Seed permission/roles diulang | Tidak membuat duplikasi |
| QA-03 | Typecheck | Bersih |
| QA-04 | Build | Sukses |
| QA-05 | Existing Task #01 tests | Tetap lulus |
| QA-06 | Direct API call tanpa UI | Enforcement benar |

---

## 14. Urutan Implementasi

```text
1. Audit schema, auth, session, dan role dari Task #01
2. Kunci permission/resource/action catalog
3. Tambahkan permission dan role-permission seed
4. Tambahkan user role binding dengan scope secara additive
5. Implement authorization context
6. Implement evaluator deny-by-default
7. Implement organization dan object scope resolver
8. Lindungi foundation administration API
9. Tambahkan introspection endpoint untuk UI
10. Tambahkan audit untuk access configuration changes
11. Integrasikan evaluator ke protected routes/services
12. Jalankan regression Task #01
13. Jalankan test matrix Task #02
14. Reconcile schema, route, dan permission naming
15. Stabilize lalu lock Task #02
```

Task #03 hanya boleh dimulai setelah object-scope structure cukup stabil untuk menjadi dasar Facility Registry.

---

## 15. Risiko dan Keputusan Implementasi

### Risiko: terlalu banyak permission sebelum domain tersedia

Mitigasi: seed permission catalog sebagai kontrak, tetapi hanya enforce pada resource yang sudah ada. Tandai domain permission sebagai `future-ready`, bukan implemented.

### Risiko: Platform Admin menjadi bypass

Mitigasi: pisahkan platform administration dari operational access. Tambahkan operational role secara eksplisit bila diperlukan.

### Risiko: scope tersimpan tetapi tidak diverifikasi

Mitigasi: setiap resolver memuat object dan ancestor relationship dari database. Jangan percaya `scopeId` atau `organizationId` dari client.

### Risiko: role matrix menjadi hardcoded di banyak tempat

Mitigasi: canonical catalog dan evaluator terpusat. UI menggunakan introspection, bukan menyalin matrix secara manual.

### Risiko: authorization lolos tetapi lifecycle salah

Mitigasi: evaluator hanya menjawab “boleh atau tidak”; service domain tetap memeriksa state transition, required evidence, approval, dan verification.

---

## 16. Completion Report

```text
TASK
Task #02 — Authorization & Permission Matrix

STATUS
RUNNING | IMPLEMENTED | VERIFIED | STABLE | BLOCKED

DEPENDENCY
Task #01 — Foundation & Authentication

BASELINE AUDIT
- Task #01 status:
- Auth/session implementation:
- Organization implementation:
- Existing role model:
- Existing migration status:
- Existing routes/services:

CHANGES
- Permission catalog:
- Role-permission matrix:
- Scope model:
- Authorization evaluator:
- Middleware/service integration:
- Audit changes:

DATABASE
- ...

ROUTES
- ...

PERMISSIONS
- ...

SCOPES
- ...

TESTS
- Passed:
- Failed:
- Not run:

ISSUES
- ...

REGRESSION
- Task #01 affected: YES/NO
- Details:

NEXT TASK
Task #03 — Facility & Space
```

`VERIFIED` tidak boleh dipakai hanya karena matrix sudah ditulis. Status tersebut membutuhkan test terhadap API langsung, cross-organization isolation, scope, dan regression Task #01.

---

## 17. Formal Verification Gate

Status `IMPLEMENTED` hanya menyatakan bahwa kode telah dibuat. Status `VERIFIED` membutuhkan bukti bahwa seluruh authorization boundary berikut lulus:

| Gate | Bukti minimum | Expected |
|---|---|---|
| Same-organization authorized access | API/service test dengan permission dan scope valid | `ALLOW` |
| Same-organization unauthorized action | direct API test tanpa permission | `DENY` |
| Cross-organization read | list, detail, search, filter, pagination, dan child endpoint | `DENY` atau safe `404` |
| Cross-organization mutation | create/update/assign/delete action | `DENY` |
| Assigned object access | user dengan permission dan assignment valid | `ALLOW` |
| Unassigned object access | user dengan role sama tanpa assignment | `DENY` |
| Direct-API bypass | request dikirim tanpa UI | `DENY` |
| Frontend bypass | hidden action dipanggil langsung | `DENY` server-side |
| Scope precedence | conflicting/inherited scope test | Deterministik |
| Separation of duties | kombinasi privilege yang dilarang | `DENY` |
| Audit | allow/deny sensitif dan perubahan binding | Recorded |
| Migration | clean database dan existing Task #01 database | `PASS` |
| Seed | dijalankan ulang tanpa duplikasi/escalation | `PASS` |
| Production build | typecheck, build, schema/runtime startup | `PASS` |
| Task #01 regression | auth, session, organization context, protected routes | `PASS` |
| Full authorization regression | seluruh role, scope, API, dan negative path | `PASS` |

Cross-organization isolation harus diuji terhadap:

```text
detail endpoint
list endpoint
filter
search
pagination
export
child/nested endpoint
direct object ID
mutation endpoint
```

Tidak boleh ada partial pass yang cukup untuk `VERIFIED`.

Jika satu saja dari gate berikut gagal:

```text
cross-organization isolation
assignment scope
direct-API authorization
migration
seed
production build
Task #01 regression
```

maka status wajib tetap:

```text
NOT VERIFIED
```

Alur remediation:

```text
ANY CRITICAL FAILURE
→ NOT VERIFIED
→ ISOLATED FIX
→ RE-RUN TASK #02 REGRESSION
→ TASK #01 REGRESSION
→ EVIDENCE REVIEW
```

`VERIFIED` berarti:

> **implementation + integration + adversarial authorization testing + regression evidence**

Canonical status transition:

```text
IMPLEMENTATION
→ INTEGRATION
→ ADVERSARIAL TESTING
→ REGRESSION
→ EVIDENCE REVIEW
→ VERIFIED
→ STABLE
→ LOCKED
```

Status berikut tidak sah:

```text
mostly passed → VERIFIED
build passed → VERIFIED
unit tests passed → VERIFIED
UI works → VERIFIED
API works → VERIFIED
```

---

## 18. Governance

Task #02 mengikuti:

```text
CANONICAL
→ ADDITIVE
→ ISOLATED
→ SERVER-ENFORCED
→ VERIFY
→ RECONCILE
→ LOCK
```

Task #02 tidak boleh:

- mengubah role canonical tanpa keputusan arsitektur eksplisit;
- menjadikan Platform Admin sebagai unrestricted operational user;
- mengandalkan hidden UI untuk security;
- menerima organization atau scope dari client tanpa verifikasi;
- membolehkan unknown permission;
- menghapus audit history;
- mengimplementasikan modul operasional palsu;
- melanjutkan ke Task #03 sebelum authorization foundation terbukti bekerja.

**Task #02 selesai ketika NEXUS-FM dapat membuktikan bukan hanya siapa user-nya, tetapi juga apa yang boleh dilakukan user tersebut, terhadap object mana, dalam organization dan scope mana.**