import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const journal = JSON.parse(await readFile(path.join(root, "drizzle/meta/_journal.json"), "utf8"));
const baseline = journal.entries.find((entry) => entry.idx === 0);
if (!baseline) throw new Error("Foundation baseline migration is missing");
const sql = await readFile(path.join(root, "drizzle", `${baseline.tag}.sql`), "utf8");
const hash = createHash("sha256").update(sql).digest("hex");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

await client.connect();
try {
  const required = ["users", "organizations", "memberships", "user_contexts", "audit_events"];
  const forbidden = ["permissions", "role_permissions", "user_role_bindings", "authorization_audit_logs", "authorization_roles"];
  const relations = await client.query(
    `select requested.name, class.relkind
       from unnest($1::text[]) as requested(name)
       left join pg_class class on class.relname = requested.name
       left join pg_namespace namespace
         on namespace.oid = class.relnamespace and namespace.nspname = 'public'`,
    [[...required, ...forbidden]],
  );
  const states = new Map(relations.rows.map((row) => [row.name, row.relkind]));
  if (required.some((name) => states.get(name) !== "r")) {
    throw new Error("Baseline adoption refused: Task #01 foundation relations are not exact tables");
  }
  if (forbidden.some((name) => states.get(name))) {
    throw new Error("Baseline adoption refused: authorization schema already exists");
  }
  const forbiddenTypes = await client.query(
    `select typname from pg_type
      join pg_namespace on pg_namespace.oid = pg_type.typnamespace
      where pg_namespace.nspname = 'public'
        and typname = any($1::text[])`,
    [[
      "binding_status",
      "permission_effect",
      "permission_status",
      "scope_type",
      "authorization_role_status",
      "authorization_permission_status",
      "authorization_permission_effect",
      "authorization_binding_status",
      "authorization_scope_type",
    ]],
  );
  if (forbiddenTypes.rowCount !== 0) {
    throw new Error("Baseline adoption refused: authorization types already exist");
  }
  const roles = await client.query(
    `select enumlabel
       from pg_enum
       join pg_type on pg_type.oid = pg_enum.enumtypid
      where pg_type.typname = 'canonical_role'
      order by enumsortorder`,
  );
  const expectedRoles = [
    "PLATFORM_ADMIN",
    "FACILITY_MANAGER",
    "FACILITY_SUPERVISOR",
    "INSPECTOR",
    "MAINTENANCE_TECHNICIAN",
    "WAREHOUSE_SUPERVISOR",
    "VENDOR",
  ];
  if (JSON.stringify(roles.rows.map((row) => row.enumlabel)) !== JSON.stringify(expectedRoles)) {
    throw new Error("Baseline adoption refused: canonical role enum does not match Task #01");
  }
  const columns = await client.query(
    `select table_name, column_name, udt_name, is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public' and table_name = any($1::text[])
      order by table_name, ordinal_position`,
    [required],
  );
  const columnFingerprint = columns.rows.map((row) =>
    [row.table_name, row.column_name, row.udt_name, row.is_nullable, row.column_default ?? ""].join("|"),
  );
  const expectedColumnFingerprint = [
    "audit_events|id|uuid|NO|gen_random_uuid()",
    "audit_events|actor_user_id|uuid|YES|",
    "audit_events|organization_id|uuid|YES|",
    "audit_events|action|text|NO|",
    "audit_events|target_type|text|NO|",
    "audit_events|target_id|text|NO|",
    "audit_events|metadata|jsonb|NO|'{}'::jsonb",
    "audit_events|created_at|timestamptz|NO|now()",
    "memberships|user_id|uuid|NO|",
    "memberships|organization_id|uuid|NO|",
    "memberships|role|canonical_role|NO|",
    "memberships|created_at|timestamptz|NO|now()",
    "organizations|id|uuid|NO|gen_random_uuid()",
    "organizations|name|text|NO|",
    "organizations|slug|text|NO|",
    "organizations|created_at|timestamptz|NO|now()",
    "organizations|updated_at|timestamptz|NO|now()",
    "user_contexts|user_id|uuid|NO|",
    "user_contexts|active_organization_id|uuid|YES|",
    "user_contexts|updated_at|timestamptz|NO|now()",
    "users|id|uuid|NO|gen_random_uuid()",
    "users|external_auth_id|text|NO|",
    "users|display_name|text|NO|",
    "users|email|text|NO|",
    "users|created_at|timestamptz|NO|now()",
    "users|updated_at|timestamptz|NO|now()",
  ];
  if (JSON.stringify(columnFingerprint) !== JSON.stringify(expectedColumnFingerprint)) {
    throw new Error("Baseline adoption refused: Task #01 column fingerprint differs");
  }
  const constraints = await client.query(
    `select relation.relname as table_name, constraint_record.conname,
            constraint_record.contype, pg_get_constraintdef(constraint_record.oid, true) as definition
       from pg_constraint constraint_record
       join pg_class relation on relation.oid = constraint_record.conrelid
       join pg_namespace namespace on namespace.oid = constraint_record.connamespace
      where namespace.nspname = 'public' and relation.relname = any($1::text[])
      order by relation.relname, constraint_record.conname`,
    [required],
  );
  const constraintFingerprint = constraints.rows.map((row) =>
    [row.table_name, row.conname, row.contype, row.definition].join("|"),
  );
  const expectedConstraintFingerprint = [
    "audit_events|audit_events_actor_user_id_users_id_fk|f|FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL",
    "audit_events|audit_events_organization_id_organizations_id_fk|f|FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL",
    "audit_events|audit_events_pkey|p|PRIMARY KEY (id)",
    "memberships|memberships_organization_id_organizations_id_fk|f|FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE",
    "memberships|memberships_user_id_organization_id_pk|p|PRIMARY KEY (user_id, organization_id)",
    "memberships|memberships_user_id_users_id_fk|f|FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE",
    "organizations|organizations_pkey|p|PRIMARY KEY (id)",
    "organizations|organizations_slug_unique|u|UNIQUE (slug)",
    "user_contexts|user_contexts_active_organization_id_organizations_id_fk|f|FOREIGN KEY (active_organization_id) REFERENCES organizations(id) ON DELETE SET NULL",
    "user_contexts|user_contexts_pkey|p|PRIMARY KEY (user_id)",
    "user_contexts|user_contexts_user_id_users_id_fk|f|FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE",
    "users|users_external_auth_id_unique|u|UNIQUE (external_auth_id)",
    "users|users_pkey|p|PRIMARY KEY (id)",
  ];
  if (JSON.stringify(constraintFingerprint) !== JSON.stringify(expectedConstraintFingerprint)) {
    throw new Error("Baseline adoption refused: Task #01 constraint fingerprint differs");
  }
  const indexes = await client.query(
    `select relation.relname as table_name, index_relation.relname as index_name,
            index_record.indisunique, index_record.indisprimary,
            pg_get_indexdef(index_relation.oid, 0, true) as definition
       from pg_index index_record
       join pg_class relation on relation.oid = index_record.indrelid
       join pg_class index_relation on index_relation.oid = index_record.indexrelid
       join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = any($1::text[])
      order by relation.relname, index_relation.relname`,
    [required],
  );
  const indexFingerprint = indexes.rows.map((row) =>
    [row.table_name, row.index_name, row.indisunique, row.indisprimary, row.definition].join("|"),
  );
  const expectedIndexFingerprint = [
    "audit_events|audit_events_pkey|true|true|CREATE UNIQUE INDEX audit_events_pkey ON audit_events USING btree (id)",
    "memberships|memberships_user_id_organization_id_pk|true|true|CREATE UNIQUE INDEX memberships_user_id_organization_id_pk ON memberships USING btree (user_id, organization_id)",
    "organizations|organizations_pkey|true|true|CREATE UNIQUE INDEX organizations_pkey ON organizations USING btree (id)",
    "organizations|organizations_slug_unique|true|false|CREATE UNIQUE INDEX organizations_slug_unique ON organizations USING btree (slug)",
    "user_contexts|user_contexts_pkey|true|true|CREATE UNIQUE INDEX user_contexts_pkey ON user_contexts USING btree (user_id)",
    "users|users_external_auth_id_unique|true|false|CREATE UNIQUE INDEX users_external_auth_id_unique ON users USING btree (external_auth_id)",
    "users|users_pkey|true|true|CREATE UNIQUE INDEX users_pkey ON users USING btree (id)",
  ];
  if (JSON.stringify(indexFingerprint) !== JSON.stringify(expectedIndexFingerprint)) {
    throw new Error("Baseline adoption refused: Task #01 index fingerprint differs");
  }

  await client.query("BEGIN");
  await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
  const tracked = await client.query("select count(*)::int as count from drizzle.__drizzle_migrations");
  if (tracked.rows[0].count !== 0) {
    throw new Error("Baseline adoption refused: migration history is not empty");
  }
  await client.query(
    "insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)",
    [hash, baseline.when],
  );
  await client.query("COMMIT");
  console.log("FOUNDATION_BASELINE_ADOPTED");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}