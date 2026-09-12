# NEXUS-FM

## Task #01 — Foundation & Authentication

**Execution Specification v1.0**  
**Status:** Ready for implementation  
**Baseline:** NEXUS-FM Master Architecture v1.0  
**Scope:** Foundation, authentication, organization context, minimum role model, protected application shell

---

## 1. Tujuan Task

Task #01 membangun fondasi yang membuat NEXUS-FM aman untuk dikembangkan sebagai sistem operasional multi-organisasi.

Task ini harus menghasilkan:

1. application shell yang stabil;
2. login, logout, dan session persistence;
3. user yang terhubung ke organization;
4. role yang tersedia di session/context;
5. perlindungan route dan API di server;
6. organization scope yang selalu tersedia bagi service layer;
7. empty state yang jujur untuk domain yang belum dibangun.

Task ini **bukan** implementasi Facility, Asset, Inspection, Finding, Risk, Work Order, atau Dashboard operasional. Menu dan route untuk domain tersebut tidak boleh ditampilkan sebagai fitur aktif sebelum domainnya benar-benar tersedia.

---

## 2. Keputusan Scope yang Dikunci

### 2.1 Minimum role yang harus tersedia

```text
PLATFORM_ADMIN
FACILITY_MANAGER
FACILITY_SUPERVISOR
INSPECTOR
MAINTENANCE_TECHNICIAN
WAREHOUSE_SUPERVISOR
VENDOR
```

Role disimpan sebagai data, dimuat ke session, dan dapat dipakai oleh authorization layer.

### 2.2 Organisasi dan scope

Setiap user Task #01 memiliki satu organization aktif. Semua request terautentikasi harus membawa organization context yang berasal dari session/server context, bukan dari input client yang dipercaya begitu saja.

Object-scope yang lebih rinci—misalnya Facility Manager hanya boleh melihat Facility A dan B, atau Vendor hanya boleh melihat Work Order tertentu—disiapkan melalui struktur data dan service boundary, tetapi policy matrix lengkap dikerjakan pada Task #02.

### 2.3 Arsitektur adaptif terhadap project

Jika project sudah memiliki stack, convention, auth, atau database yang berjalan, implementasi harus mengikuti fondasi tersebut dan hanya menambah bagian yang diperlukan.

Jika tidak ada aplikasi yang dapat dipertahankan, gunakan:

```text
Frontend  : React + TypeScript
Backend   : TypeScript, typed API/service layer
Database  : PostgreSQL
ORM       : Drizzle atau ORM yang sudah menjadi standar project
```

Jangan mengganti stack yang sudah stabil hanya karena ada preferensi teknis lain.

---

## 3. Non-Goals

Jangan mengimplementasikan hal-hal berikut dalam Task #01:

- Facility Registry;
- Building/Warehouse/Area;
- Asset Register;
- Inspection Engine;
- Finding dan Risk Engine;
- Work Order Engine;
- mobile field execution;
- file/evidence upload;
- Preventive Maintenance;
- dashboard dengan angka operasional palsu;
- AI, predictive maintenance, atau recommendation;
- full permission matrix dan delegated administration;
- billing, procurement, accounting, atau project management.

Dashboard awal hanya boleh menampilkan status foundation, identitas user, organization aktif, role, dan navigasi ke fitur yang memang tersedia.

---

## 4. Baseline Audit Sebelum Coding

Sebelum perubahan kode, engineer wajib mencatat:

| Area | Yang harus diperiksa |
|---|---|
| Framework | framework frontend/backend dan entry points |
| Package | package manager, scripts, dependency penting |
| Frontend | route, layout, component convention, styling |
| Backend | server entry, API pattern, middleware |
| Database | provider, schema, migration, seed |
| Authentication | provider, session strategy, cookie/token behavior |
| Existing routes | public, protected, API |
| Runtime | dev server, build, typecheck, test status |
| Existing behavior | fitur yang wajib tetap berjalan |

Hasil audit harus disimpan sebagai bagian dari completion report. Jika project tidak tersedia, status audit ditulis `NOT AVAILABLE — SPECIFICATION ONLY`; jangan mengarang hasil audit.

---

## 5. Arsitektur Teknis Minimum

Gunakan batas berikut:

```text
UI
 ↓
Route / API Handler
 ↓
Authentication + Authorization Middleware
 ↓
Application Service
 ↓
Repository / Data Access
 ↓
Database
```

Cross-cutting concern minimum:

- validation;
- structured error response;
- logging;
- audit hook untuk perubahan sensitif;
- organization context;
- secure session handling.

Business rule tidak boleh hanya berada di React component. UI boleh menyembunyikan action yang tidak relevan, tetapi server tetap wajib menolak action tersebut.

---

## 6. Schema Minimum

Nama tabel boleh mengikuti convention project. Bentuk konseptual berikut harus dipertahankan.

### 6.1 `organizations`

| Field | Aturan |
|---|---|
| `id` | primary key |
| `name` | required |
| `slug` | required, unique |
| `status` | `ACTIVE` atau `SUSPENDED` |
| `createdAt` | required |
| `updatedAt` | required |

### 6.2 `users`

| Field | Aturan |
|---|---|
| `id` | primary key |
| `organizationId` | required foreign key |
| `email` | required, normalized, unique sesuai scope auth |
| `name` | required |
| `passwordHash` atau auth-provider reference | tidak boleh menyimpan password plaintext |
| `status` | `ACTIVE`, `INVITED`, `SUSPENDED` |
| `createdAt` | required |
| `updatedAt` | required |
| `lastLoginAt` | nullable |

### 6.3 `roles`

| Field | Aturan |
|---|---|
| `id` | primary key |
| `code` | unique, canonical uppercase code |
| `name` | required |
| `description` | nullable |

Seed canonical roles:

```text
PLATFORM_ADMIN
FACILITY_MANAGER
FACILITY_SUPERVISOR
INSPECTOR
MAINTENANCE_TECHNICIAN
WAREHOUSE_SUPERVISOR
VENDOR
```

### 6.4 `user_roles`

| Field | Aturan |
|---|---|
| `userId` | required foreign key |
| `roleId` | required foreign key |
| `organizationId` | required scope |
| `createdAt` | required |

Gunakan unique constraint yang mencegah duplikasi kombinasi user-role-organization.

### 6.5 `sessions`

Jika auth dikelola aplikasi:

| Field | Aturan |
|---|---|
| `id` | primary key atau session identifier |
| `userId` | required |
| `organizationId` | required |
| `expiresAt` | required |
| `createdAt` | required |
| `lastSeenAt` | required |
| `revokedAt` | nullable |

Session cookie harus `HttpOnly`, `Secure` pada production, dan memiliki `SameSite` yang sesuai dengan deployment. Jangan menaruh password, secret, atau credential di client bundle.

### 6.6 `audit_logs` — minimum foundation

Task #01 tidak perlu membangun audit UI, tetapi perubahan autentikasi dan administrasi minimum harus dapat direkam bila sistem sudah memiliki audit mechanism.

Field minimum:

```text
id
organizationId
actorUserId
action
targetType
targetId
metadata
createdAt
```

Audit record tidak boleh dapat diubah melalui route biasa.

---

## 7. Authentication Contract

### 7.1 Login

Input minimum:

```json
{
  "email": "user@example.com",
  "password": "********"
}
```

Aturan:

- normalize email sebelum lookup;
- password diverifikasi terhadap hash;
- user `SUSPENDED` atau organization `SUSPENDED` ditolak;
- error login tidak membocorkan apakah email terdaftar;
- session dibuat setelah autentikasi sukses;
- session memuat `userId`, `organizationId`, dan role claims yang aman untuk authorization;
- `lastLoginAt` diperbarui setelah login sukses.

### 7.2 Logout

Logout harus:

- revoke atau menghapus session server;
- membersihkan cookie client;
- tidak hanya melakukan redirect;
- membuat request berikutnya ke protected route menjadi unauthenticated.

### 7.3 Session lookup

Semua protected route menggunakan satu fungsi/service terpusat, misalnya:

```text
requireAuthenticatedUser()
requireRole(...)
getOrganizationContext()
```

Jangan menduplikasi parsing cookie dan pengecekan role di setiap halaman.

### 7.4 Unauthorized behavior

| Situasi | UI response | API response |
|---|---|---|
| Belum login | redirect ke `/login` | `401 UNAUTHENTICATED` |
| Login valid, role tidak diizinkan | halaman 403 | `403 FORBIDDEN` |
| Object di luar organization scope | not found/forbidden sesuai kebijakan | `403` atau `404`, konsisten |
| Session expired | kembali ke login dengan pesan aman | `401 UNAUTHENTICATED` |

Jangan menampilkan stack trace, query detail, atau secret dalam response.

---

## 8. Authorization Minimum

### 8.1 Route-level access

| Area | PLATFORM_ADMIN | Role operasional lain |
|---|---:|---:|
| Application shell | Ya | Ya |
| Profile/session | Ya | Ya |
| Admin foundation | Ya | Tidak, kecuali ditentukan khusus |
| Placeholder domain | Tidak ada akses palsu | Tidak ada akses palsu |

Role operasional boleh masuk ke shell, tetapi tidak boleh memperoleh akses administratif hanya karena berhasil login.

### 8.2 API-level access

Setiap endpoint protected wajib menjalankan:

1. validasi session;
2. validasi user aktif;
3. validasi organization context;
4. validasi role/action;
5. validasi object scope jika object sudah tersedia.

Client tidak boleh memilih `organizationId` untuk membaca atau menulis data lalu server mempercayainya tanpa membandingkan dengan session context.

### 8.3 Role loading

Role harus tersedia di:

- server request context;
- session/context provider frontend;
- user profile response;
- authorization helper.

Role display tidak boleh menjadi satu-satunya mekanisme security.

---

## 9. Application Shell dan Route Map

### Public routes

```text
/login
/logout        (action endpoint, bila diperlukan)
/health        (internal/operational health check)
```

### Protected foundation routes

```text
/dashboard
/profile
/settings       (hanya bagian foundation yang benar-benar tersedia)
/admin/users    (hanya jika user administration memang diimplementasikan)
/admin/roles    (hanya jika role administration memang diimplementasikan)
/403
/404
```

### Shell minimum

- responsive sidebar;
- top navigation;
- organization indicator;
- user menu;
- logout action;
- notification area hanya sebagai shell/empty state;
- main content area;
- active route state;
- mobile navigation behavior;
- loading, error, dan empty state yang disengaja.

Navigasi ke domain masa depan harus diberi status `Coming later` atau tidak ditampilkan. Jangan membuat route palsu yang terlihat seolah-olah sudah operasional.

---

## 10. API Surface Minimum

Nama endpoint dapat menyesuaikan convention project, tetapi perilakunya harus setara.

```text
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/session
GET  /api/me
GET  /api/health
```

Jika user/organization administration sudah diperlukan untuk bootstrap:

```text
GET   /api/admin/users
POST  /api/admin/users
PATCH /api/admin/users/:id/status
```

Tidak boleh ada endpoint generik seperti:

```text
PATCH /api/update-anything
```

Response error minimum:

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Authentication is required."
  }
}
```

Pesan untuk user boleh diterjemahkan ke Bahasa Indonesia pada UI, tetapi error code server harus stabil untuk logging dan client handling.

---

## 11. Seed dan Bootstrap

Seed hanya boleh membuat data yang jelas ditandai sebagai development/demo.

Minimum seed:

- satu organization demo;
- satu user development dengan role `PLATFORM_ADMIN`;
- satu user development dengan role operasional untuk menguji authorization;
- canonical roles.

Credential development tidak boleh ditulis di source code atau committed secret. Gunakan environment variable/secret manager. Jika project tidak punya seed mechanism, dokumentasikan langkah manual tanpa menanam password default di repository.

---

## 12. Definition of Done

Task #01 hanya dapat berstatus `VERIFIED` jika seluruh kriteria ini terpenuhi:

### Authentication

- user valid dapat login;
- user dapat logout;
- protected route menolak unauthenticated request;
- session bertahan sesuai expiry;
- session yang expired/revoked ditolak;
- invalid login menghasilkan error aman;
- user suspended tidak dapat login.

### Organization dan role

- user memiliki organization;
- organization context tersedia di server service;
- role tersimpan dan dimuat ke session;
- role dapat digunakan oleh authorization helper;
- akses lintas organization tidak dimungkinkan pada endpoint yang sudah memiliki data scope.

### UI

- shell responsif;
- sidebar dan top navigation bekerja;
- logout dapat dilakukan dari user menu;
- 401, 403, 404, loading, dan empty state ditangani;
- tidak ada link aktif menuju fitur yang belum diimplementasikan;
- refresh pada protected route tidak menghilangkan session valid.

### Engineering

- migration berjalan dari database kosong;
- seed berjalan bila seed disediakan;
- typecheck bersih;
- build berjalan;
- tidak ada credential di source code;
- existing functionality tidak rusak tanpa alasan yang terdokumentasi.

---

## 13. Test Matrix

### Functional

| ID | Skenario | Expected |
|---|---|---|
| AUTH-01 | Login dengan credential valid | Session dibuat, user masuk dashboard |
| AUTH-02 | Login dengan password salah | Gagal dengan error aman |
| AUTH-03 | Login dengan email tidak terdaftar | Gagal dengan error aman |
| AUTH-04 | Logout | Session dicabut, protected route tidak dapat dibuka |
| AUTH-05 | Refresh setelah login | Session tetap tersedia sampai expiry |
| AUTH-06 | Session expired | User diarahkan ke login |
| AUTH-07 | User suspended | Login ditolak |

### Authorization

| ID | Skenario | Expected |
|---|---|---|
| AUTHZ-01 | Anonymous membuka `/dashboard` | Redirect/login atau 401 |
| AUTHZ-02 | Role operasional membuka admin route | 403 |
| AUTHZ-03 | Request tanpa session ke protected API | 401 |
| AUTHZ-04 | Client mengirim organizationId lain | Ditolak |
| AUTHZ-05 | Role tersedia di server context | Helper membaca role yang benar |
| AUTHZ-06 | User dari organization A meminta object organization B | Ditolak |

### Quality

| ID | Skenario | Expected |
|---|---|---|
| QA-01 | Database kosong lalu migration | Sukses |
| QA-02 | Seed development | Sukses dan idempotent bila dirancang demikian |
| QA-03 | Typecheck | Tidak ada error |
| QA-04 | Production build | Sukses |
| QA-05 | Desktop shell | Tidak ada overflow/broken navigation |
| QA-06 | Mobile shell | Navigation tetap dapat digunakan |
| QA-07 | Direct URL protected route | Behavior auth benar |

---

## 14. Urutan Implementasi

```text
1. Audit project dan catat baseline
2. Pastikan database/migration strategy
3. Tambahkan organization, user, role, user_roles, session
4. Seed canonical roles dan development data secara aman
5. Implement auth service dan session handling
6. Implement server auth/organization middleware
7. Implement login/logout/session API
8. Implement protected application shell
9. Implement role-aware route protection
10. Tambahkan error, loading, empty, dan responsive states
11. Jalankan migration, seed, typecheck, build
12. Jalankan seluruh test matrix
13. Perbaiki temuan
14. Tulis completion report
15. Lock Task #01
```

Jangan memulai Task #02 sebelum Task #01 berstatus `STABLE`.

---

## 15. Completion Report Template

```text
TASK
Task #01 — Foundation & Authentication

STATUS
RUNNING | IMPLEMENTED | VERIFIED | STABLE | BLOCKED

BASELINE AUDIT
- Framework:
- Frontend:
- Backend:
- Database/ORM:
- Authentication:
- Existing routes:
- Existing schema:
- Runtime/build:
- Functionality preserved:

CHANGES
- ...

DATABASE
- ...

ROUTES
- ...

AUTHORIZATION
- ...

TESTS
- ...

ISSUES
- ...

REGRESSION
- ...

NEXT TASK
Task #02 — Organization / Role / Permission
```

Status `IMPLEMENTED` berarti kode sudah dibuat. Status `VERIFIED` berarti acceptance criteria dan test matrix sudah dijalankan. Status `STABLE` hanya boleh dipakai setelah regression check dan reconciliation selesai.

---

## 16. Guardrails

Task #01 harus mengikuti:

```text
CANONICAL
→ ADDITIVE
→ ISOLATED
→ VERIFY
→ RECONCILE
→ LOCK
```

Larangan terakhir:

- jangan menyatakan fitur backend selesai jika baru ada UI;
- jangan membuat angka facility health, work order, cost, atau risk palsu;
- jangan membangun AI sebelum data domain tersedia;
- jangan menaruh business logic penting di UI;
- jangan menghapus data atau auth existing tanpa pemeriksaan dan alasan;
- jangan memperluas scope ke Task #02–#17 sebelum Task #01 diverifikasi.

**Task #01 selesai ketika NEXUS-FM memiliki fondasi login dan scope yang dapat dipercaya—bukan ketika dashboard terlihat penuh.**