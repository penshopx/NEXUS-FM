import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsRoot = path.join(root, "drizzle");
const entries = await readdir(migrationsRoot, { withFileTypes: true });
const migrations = [];

for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const migrationPath = path.join(migrationsRoot, entry.name, "migration.sql");
  let sql;
  try {
    sql = await readFile(migrationPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
  const timestamp = entry.name.slice(0, 14);
  if (!/^\d{14}$/.test(timestamp)) {
    throw new Error(`Invalid migration folder timestamp: ${entry.name}`);
  }
  const createdAt = Date.UTC(
    Number(timestamp.slice(0, 4)),
    Number(timestamp.slice(4, 6)) - 1,
    Number(timestamp.slice(6, 8)),
    Number(timestamp.slice(8, 10)),
    Number(timestamp.slice(10, 12)),
    Number(timestamp.slice(12, 14)),
  );
  migrations.push({
    name: entry.name,
    sql,
    createdAt,
    hash: createHash("sha256").update(sql).digest("hex"),
  });
}

if (migrations.length === 0) throw new Error("No local migrations were found");

const destructivePattern = /\b(?:TRUNCATE|DROP|DELETE\s+FROM)\b/i;
const concurrentIndexPattern = /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i;
const statements = (sql) => sql
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);

function pendingMigrations(appliedHashes) {
  const localHashes = new Set(migrations.map(({ hash }) => hash));
  const unknown = [...appliedHashes].filter((hash) => !localHashes.has(hash));
  if (unknown.length > 0) {
    throw new Error(
      `Migration verification failed: ${unknown.length} applied hash(es) are absent locally`,
    );
  }

  let encounteredGap = false;
  const pending = [];
  for (const migration of migrations) {
    if (appliedHashes.has(migration.hash)) {
      if (encounteredGap) {
        throw new Error(
          `Migration verification failed: applied migration ${migration.name} follows an untracked migration`,
        );
      }
    } else {
      encounteredGap = true;
      pending.push(migration);
    }
  }
  return pending;
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('nexus-fm-safe-migrations'))");

  const journalExists = await client.query(
    "select to_regclass('drizzle.__drizzle_migrations') is not null as exists",
  );
  if (!journalExists.rows[0].exists) {
    const tables = await client.query(`
      select count(*)::int as count
      from pg_tables
      where schemaname = 'public'
        and tablename not like 'pg_%'
    `);
    if (tables.rows[0].count !== 0) {
      throw new Error(
        "Migration verification failed: schema objects exist but the migration journal is missing",
      );
    }
    await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
    await client.query(`
      CREATE TABLE drizzle.__drizzle_migrations (
        id serial PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint,
        name text,
        applied_at timestamp with time zone DEFAULT now()
      )
    `);
  }

  const tracked = await client.query(
    "select id, hash from drizzle.__drizzle_migrations order by created_at, id",
  );
  if (tracked.rows.length === 0) {
    const tables = await client.query(`
      select count(*)::int as count
      from pg_tables
      where schemaname = 'public'
        and tablename not like 'pg_%'
    `);
    if (tables.rows[0].count !== 0) {
      throw new Error(
        "Migration verification failed: schema objects exist but the migration journal is empty",
      );
    }
  }

  const appliedHashes = new Set(tracked.rows.map(({ hash }) => hash));
  const pending = pendingMigrations(appliedHashes);
  const journalColumns = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'drizzle'
      and table_name = '__drizzle_migrations'
  `);
  const columnNames = new Set(journalColumns.rows.map(({ column_name }) => column_name));
  if (!columnNames.has("name")) {
    await client.query("alter table drizzle.__drizzle_migrations add column name text");
  }
  if (!columnNames.has("applied_at")) {
    await client.query(`
      alter table drizzle.__drizzle_migrations
      add column applied_at timestamp with time zone default now()
    `);
  }

  const migrationByHash = new Map(migrations.map((migration) => [migration.hash, migration]));
  for (const row of tracked.rows) {
    await client.query(
      `update drizzle.__drizzle_migrations
       set name = $1, applied_at = null
       where id = $2 and name is null`,
      [migrationByHash.get(row.hash).name, row.id],
    );
  }

  for (const migration of pending) {
    for (const statement of statements(migration.sql)) {
      if (destructivePattern.test(statement)) {
        throw new Error(`Destructive SQL refused in migration ${migration.name}`);
      }
      if (concurrentIndexPattern.test(statement)) {
        throw new Error(
          `Concurrent index creation cannot run in the migration transaction: ${migration.name}`,
        );
      }
      await client.query(statement);
    }
    await client.query(
      "insert into drizzle.__drizzle_migrations (hash, created_at, name) values ($1, $2, $3)",
      [migration.hash, migration.createdAt, migration.name],
    );
    console.log(`APPLIED: ${migration.name}`);
  }

  await client.query("COMMIT");
  console.log(
    pending.length === 0
      ? `MIGRATIONS VERIFIED: ${migrations.length}/${migrations.length} local hashes are already applied.`
      : `MIGRATIONS APPLIED: ${pending.length}; destructive operations: none.`,
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}