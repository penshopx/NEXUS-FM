import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = path.resolve(root, "../..");
const migrationFiles = [
  "20260912024313_gray_zemo/migration.sql",
  "20260912024336_needy_red_wolf/migration.sql",
  "20260912024445_spooky_satana/migration.sql",
  "20260917205728_adopt_current_authorization/migration.sql",
  "20260917205823_facility_registry/migration.sql",
];
const migrations = await Promise.all(migrationFiles.map(async (file) => ({
  file,
  sql: await readFile(path.join(root, "drizzle", file), "utf8"),
})));
const statements = (sql) => sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean);
const catalogBundle = path.join(root, `.authorization-catalog-${process.pid}.mjs`);
const catalogRunner = path.join(root, `.authorization-catalog-runner-${process.pid}.mjs`);
await exec(path.join(workspace, "artifacts/api-server/node_modules/.bin/esbuild"), [
  "artifacts/api-server/src/services/authorization-catalog.ts",
  "--bundle", "--platform=node", "--format=esm", "--external:pg",
  "--external:drizzle-orm", `--outfile=${catalogBundle}`,
], { cwd: workspace });
await writeFile(catalogRunner, `
  import { seedAuthorizationCatalog } from ${JSON.stringify(catalogBundle)};
  await seedAuthorizationCatalog({ force: true });
`);

const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
await admin.connect();
const baseUrl = new URL(process.env.DATABASE_URL);

async function createTarget(label) {
  const database = `nexus_migration_${label}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  await admin.query(`CREATE DATABASE "${database}"`);
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  return { database, url, client };
}

async function apply(client, fromIndex = 0) {
  for (const migration of migrations.slice(fromIndex)) {
    for (const statement of statements(migration.sql)) await client.query(statement);
  }
}

async function runMigrations(url) {
  await exec(path.join(root, "node_modules/.bin/drizzle-kit"), ["migrate", "--config", "./drizzle.config.ts"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url.toString() },
  });
}

function assertNonInteractive(result, label) {
  const output = `${result.stdout}\n${result.stderr}`;
  if (
    output.includes("You're about to")
    || output.includes("truncate table")
    || output.includes("Interactive prompts require a TTY")
  ) {
    throw new Error(`${label}: schema reconciliation requested an interactive or destructive operation`);
  }
}

async function runPostMerge(url) {
  const result = await exec("bash", ["./scripts/post-merge.sh"], {
    cwd: workspace,
    env: { ...process.env, DATABASE_URL: url.toString() },
  });
  assertNonInteractive(result, "post-merge");
}

async function reconcileSchema(url) {
  const result = await exec(path.join(root, "node_modules/.bin/drizzle-kit"), [
    "push",
    "--verbose",
    "--config",
    "./drizzle.config.ts",
  ], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url.toString() },
  });
  assertNonInteractive(result, "drizzle-kit push");
}

const preservedTables = [
  "users",
  "organizations",
  "memberships",
  "user_contexts",
  "audit_events",
  "authorization_roles",
  "permissions",
  "role_permissions",
  "user_role_bindings",
  "authorization_audit_logs",
];

async function snapshotPreservedData(client) {
  const snapshot = {};
  for (const table of preservedTables) {
    const result = await client.query(`
      select row_to_json(row) as value
      from (select * from "${table}") row
      order by row_to_json(row)::text
    `);
    snapshot[table] = result.rows.map(({ value }) => value);
  }
  return snapshot;
}

async function snapshotAuthorizationSchema(client) {
  const result = await client.query(`
    select
      constrained_table.relname as table_name,
      constraint_record.conname as constraint_name,
      pg_get_constraintdef(constraint_record.oid) as definition
    from pg_constraint constraint_record
    join pg_class constrained_table on constrained_table.oid = constraint_record.conrelid
    join pg_namespace constraint_namespace on constraint_namespace.oid = constraint_record.connamespace
    where constraint_namespace.nspname = 'public'
      and constrained_table.relname in (
        'authorization_roles',
        'permissions',
        'role_permissions',
        'user_role_bindings',
        'authorization_audit_logs'
      )
    order by constrained_table.relname, constraint_record.conname
  `);
  return result.rows;
}

async function seedCatalog(url) {
  await exec("node", [catalogRunner], {
    cwd: workspace,
    env: { ...process.env, DATABASE_URL: url.toString() },
  });
}

async function seedAndCheck(client, url, label) {
  const requiredColumns = {
    users: ["is_active"],
    organizations: ["is_active"],
    memberships: ["is_active"],
    authorization_roles: ["id", "code", "status", "policy_version", "created_at", "updated_at"],
    role_permissions: ["role_id", "permission_id", "default_scope_type", "effect"],
    user_role_bindings: ["role_id", "version", "scope_type", "scope_id", "status"],
    authorization_audit_logs: ["action", "resource", "resource_id", "decision", "reason_code", "request_id", "before_state", "after_state"],
    facilities: ["id", "organization_id", "name", "status"],
    buildings: ["id", "organization_id", "facility_id", "name", "status"],
    spaces: ["id", "organization_id", "facility_id", "building_id", "name", "status"],
    systems: ["id", "organization_id", "facility_id", "building_id", "space_id", "name", "status"],
    assets: ["id", "organization_id", "facility_id", "building_id", "space_id", "system_id", "name", "status"],
  };
  const columnRows = await client.query(`
    select table_name, column_name from information_schema.columns
    where table_schema='public' and table_name = any($1::text[])
  `, [Object.keys(requiredColumns)]);
  const available = new Map();
  for (const row of columnRows.rows) {
    if (!available.has(row.table_name)) available.set(row.table_name, new Set());
    available.get(row.table_name).add(row.column_name);
  }
  for (const [table, columns] of Object.entries(requiredColumns)) {
    if (!columns.every((column) => available.get(table)?.has(column))) {
      throw new Error(`${label}: current schema columns missing on ${table}`);
    }
  }
  const foreignKeys = await client.query(`
    select constraint_name from information_schema.table_constraints
    where constraint_schema='public' and constraint_type='FOREIGN KEY'
      and constraint_name in (
        'role_permissions_role_id_authorization_roles_id_fk',
        'user_role_bindings_role_id_authorization_roles_id_fk'
      )
  `);
  if (foreignKeys.rowCount !== 2) throw new Error(`${label}: authorization role foreign keys missing`);
  const bindingUnique = await client.query(`
    select pg_get_constraintdef(oid) as definition
    from pg_constraint where conname='user_role_binding_unique'
  `);
  if (!bindingUnique.rows[0]?.definition.includes("NULLS NOT DISTINCT")) {
    throw new Error(`${label}: null-safe binding uniqueness missing`);
  }
  const enumRows = await client.query(`
    select typname, array_agg(enumlabel order by enumsortorder)::text[] as labels
    from pg_type join pg_enum on pg_enum.enumtypid=pg_type.oid
    join pg_namespace on pg_namespace.oid=pg_type.typnamespace
    where pg_namespace.nspname='public' and typname in (
      'authorization_role_status', 'authorization_permission_status',
      'authorization_permission_effect', 'authorization_binding_status',
      'authorization_scope_type'
    )
    group by typname
  `);
  const enumLabels = new Map(enumRows.rows.map((row) => [row.typname, row.labels]));
  if (JSON.stringify(enumLabels.get("authorization_binding_status")) !== JSON.stringify(["ACTIVE", "SUSPENDED", "EXPIRED"])) {
    throw new Error(`${label}: binding lifecycle enum is not current`);
  }
  if (enumLabels.get("authorization_binding_status")?.includes("REVOKED")) {
    throw new Error(`${label}: obsolete REVOKED lifecycle remains`);
  }
  const registryForeignKeys = await client.query(`
    select constraint_name from information_schema.table_constraints
    where constraint_schema='public' and constraint_type='FOREIGN KEY'
      and constraint_name in (
        'buildings_facility_organization_fk',
        'spaces_building_facility_organization_fk',
        'systems_space_building_facility_organization_fk',
        'assets_space_building_facility_organization_fk',
        'assets_system_space_building_facility_organization_fk'
      )
  `);
  if (registryForeignKeys.rowCount !== 5) throw new Error(`${label}: registry ancestor foreign keys missing`);
  const registryUniques = await client.query(`
    select conname from pg_constraint
    where contype='u' and conname in (
      'facilities_id_organization_unique',
      'buildings_id_facility_organization_unique',
      'spaces_id_building_facility_organization_unique',
      'systems_id_space_building_facility_organization_unique',
      'assets_id_organization_unique'
    )
  `);
  if (registryUniques.rowCount !== 5) throw new Error(`${label}: registry uniqueness missing`);
  const roles = await client.query("select code,id from authorization_roles order by code");
  if (roles.rowCount !== 7) throw new Error(`${label}: canonical role seed missing`);
  await client.query(`
    insert into permissions (code, resource, action)
    values ('ORGANIZATION.VIEW', 'ORGANIZATION', 'VIEW')
    on conflict (code) do nothing
  `);
  const manager = roles.rows.find((row) => row.code === "FACILITY_MANAGER");
  const permission = await client.query("select id from permissions where code = 'ORGANIZATION.VIEW'");
  await client.query(`
    insert into role_permissions (role_id, permission_id, default_scope_type, effect)
    values ($1, $2, 'ORGANIZATION', 'ALLOW')
    on conflict do nothing
  `, [manager.id, permission.rows[0].id]);
  const user = await client.query(`
    insert into users (external_auth_id, display_name, email)
    values ($1, 'Migration Check', $2) returning id
  `, [`migration-${label}-${randomUUID()}`, `${randomUUID()}@migration.invalid`]);
  const organization = await client.query(`
    insert into organizations (name, slug) values ('Migration Check', $1) returning id
  `, [`migration-${label}-${randomUUID()}`]);
  await client.query(
    "insert into memberships (user_id, organization_id, role) values ($1,$2,'FACILITY_MANAGER')",
    [user.rows[0].id, organization.rows[0].id],
  );
  await client.query(
    "insert into user_role_bindings (user_id, organization_id, role_id, scope_type, granted_by) values ($1,$2,$3,'ORGANIZATION',$1)",
    [user.rows[0].id, organization.rows[0].id, manager.id],
  );
  const facility = await client.query(
    "insert into facilities (organization_id, name, code) values ($1,'Migration Facility','MIGRATION') returning id",
    [organization.rows[0].id],
  );
  const building = await client.query(
    "insert into buildings (organization_id, facility_id, name) values ($1,$2,'Migration Building') returning id",
    [organization.rows[0].id, facility.rows[0].id],
  );
  const space = await client.query(
    "insert into spaces (organization_id, facility_id, building_id, name) values ($1,$2,$3,'Migration Space') returning id",
    [organization.rows[0].id, facility.rows[0].id, building.rows[0].id],
  );
  const system = await client.query(
    "insert into systems (organization_id, facility_id, building_id, space_id, name) values ($1,$2,$3,$4,'Migration System') returning id",
    [organization.rows[0].id, facility.rows[0].id, building.rows[0].id, space.rows[0].id],
  );
  await client.query(
    "insert into assets (organization_id, facility_id, building_id, space_id, system_id, name) values ($1,$2,$3,$4,$5,'Migration Asset')",
    [organization.rows[0].id, facility.rows[0].id, building.rows[0].id, space.rows[0].id, system.rows[0].id],
  );
  try {
    await client.query(
      "insert into spaces (organization_id, facility_id, building_id, name) values ($1,$2,$3,'Tampered Space')",
      [organization.rows[0].id, randomUUID(), building.rows[0].id],
    );
    throw new Error(`${label}: cross-ancestor registry FK failed`);
  } catch (error) {
    if (error.code !== "23503") throw error;
  }
  const decision = await client.query(`
    select p.code, rp.effect
    from user_role_bindings b
    join authorization_roles r on r.id = b.role_id
    join role_permissions rp on rp.role_id = r.id
    join permissions p on p.id = rp.permission_id
    where b.user_id = $1 and b.organization_id = $2
      and b.status = 'ACTIVE' and p.code = 'ORGANIZATION.VIEW'
  `, [user.rows[0].id, organization.rows[0].id]);
  if (decision.rows[0]?.effect !== "ALLOW") throw new Error(`${label}: representative authorization query failed`);
  await client.query(
    "update role_permissions set effect='DENY' where role_id=$1 and permission_id=$2",
    [manager.id, permission.rows[0].id],
  );
  const deny = await client.query(
    "select effect from role_permissions where role_id=$1 and permission_id=$2",
    [manager.id, permission.rows[0].id],
  );
  if (deny.rows[0]?.effect !== "DENY") throw new Error(`${label}: explicit deny persistence failed`);
  try {
    await client.query(
      "insert into user_role_bindings (user_id, organization_id, role_id, scope_type, granted_by) values ($1,$2,$3,'ORGANIZATION',$1)",
      [user.rows[0].id, organization.rows[0].id, manager.id],
    );
    throw new Error(`${label}: NULLS NOT DISTINCT uniqueness failed`);
  } catch (error) {
    if (error.code !== "23505") throw error;
  }
  const beforePostMerge = await snapshotPreservedData(client);
  await runPostMerge(url);
  const afterPostMerge = await snapshotPreservedData(client);
  if (JSON.stringify(afterPostMerge) !== JSON.stringify(beforePostMerge)) {
    throw new Error(`${label}: post-merge reconciliation changed preserved data`);
  }
  const beforeReconciliation = await snapshotPreservedData(client);
  const schemaBeforeReconciliation = await snapshotAuthorizationSchema(client);
  await reconcileSchema(url);
  const afterReconciliation = await snapshotPreservedData(client);
  const schemaAfterReconciliation = await snapshotAuthorizationSchema(client);
  if (JSON.stringify(afterReconciliation) !== JSON.stringify(beforeReconciliation)) {
    throw new Error(`${label}: schema reconciliation changed preserved data`);
  }
  if (JSON.stringify(schemaAfterReconciliation) !== JSON.stringify(schemaBeforeReconciliation)) {
    throw new Error(`${label}: schema reconciliation changed authorization constraints`);
  }
  console.log(`MIGRATION_AUTHORIZATION_CHECK_PASS:${label}`);
}

async function cleanup(target) {
  await target.client.end().catch(() => undefined);
  await admin.query(`DROP DATABASE IF EXISTS "${target.database}"`);
}

try {
  const empty = await createTarget("empty");
  try {
    await runMigrations(empty.url);
    await seedCatalog(empty.url);
    await seedAndCheck(empty.client, empty.url, "empty");
  } finally {
    await cleanup(empty);
  }

  const adopted = await createTarget("adopted");
  try {
    for (const statement of statements(migrations[0].sql)) await adopted.client.query(statement);
    await exec("node", ["./scripts/adopt-foundation-baseline.mjs"], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: adopted.url.toString() },
    });
    await runMigrations(adopted.url);
    await seedCatalog(adopted.url);
    await seedAndCheck(adopted.client, adopted.url, "task01-adopted");
  } finally {
    await cleanup(adopted);
  }
} finally {
  await admin.end();
  await unlink(catalogRunner).catch(() => undefined);
  await unlink(catalogBundle).catch(() => undefined);
}

console.log("SCHEMA VERIFIED");
console.log("DESTRUCTIVE OPERATION: NONE");
console.log("AUTHORIZATION DATA PRESERVED");
console.log("REGRESSION: PASS");
