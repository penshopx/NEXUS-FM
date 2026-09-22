import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsRoot = process.env.NEXUS_MIGRATIONS_ROOT
  ? path.resolve(process.env.NEXUS_MIGRATIONS_ROOT)
  : path.join(root, "drizzle");
const compatibleHistoricalHashes = new Map([
  ["20260920003525_chilly_scarlet_witch", ["0cda3923e8da5682ad559b756391033ab4de3f833d9bbd26d2cee834226dde6c"]],
]);
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
  const hash = createHash("sha256").update(sql).digest("hex");
  migrations.push({
    name: entry.name,
    sql,
    createdAt,
    hash,
    acceptedHashes: [hash, ...(compatibleHistoricalHashes.get(entry.name) ?? [])],
  });
}

if (migrations.length === 0) throw new Error("No local migrations were found");

const destructivePattern = /\b(?:TRUNCATE|DROP|DELETE\s+FROM)\b/i;
const concurrentIndexPattern = /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i;
const concurrentIndexNamePattern = /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+"([^"]+)"/i;
const statements = (sql) => sql
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);

function pendingMigrations(appliedHashes) {
  const localHashes = new Set(migrations.flatMap(({ acceptedHashes }) => acceptedHashes));
  const unknown = [...appliedHashes].filter((hash) => !localHashes.has(hash));
  if (unknown.length > 0) {
    throw new Error(
      `Migration verification failed: ${unknown.length} applied hash(es) are absent locally`,
    );
  }

  let encounteredGap = false;
  const pending = [];
  for (const migration of migrations) {
    if (migration.acceptedHashes.some((hash) => appliedHashes.has(hash))) {
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

async function runConcurrentIndexStatement(client, statement, migrationName) {
  const indexName = statement.match(concurrentIndexNamePattern)?.[1];
  if (!indexName) {
    throw new Error(`Concurrent index name could not be parsed in migration ${migrationName}`);
  }
  const existing = await client.query(`
    select index_record.indisvalid as valid
    from pg_class index_class
    join pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
    join pg_index index_record on index_record.indexrelid = index_class.oid
    where index_namespace.nspname = current_schema()
      and index_class.relname = $1
  `, [indexName]);
  if (existing.rows[0]?.valid) return;
  if (existing.rowCount > 0) {
    console.log(`RETRYING INVALID INDEX: ${indexName}`);
    await client.query(`DROP INDEX CONCURRENTLY "${indexName}"`);
  }
  const startedAt = performance.now();
  console.log(`BUILDING CONCURRENT INDEX: ${indexName}`);
  await client.query(statement);
  const completed = await client.query(`
    select index_record.indisvalid as valid
    from pg_class index_class
    join pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
    join pg_index index_record on index_record.indexrelid = index_class.oid
    where index_namespace.nspname = current_schema()
      and index_class.relname = $1
  `, [indexName]);
  if (!completed.rows[0]?.valid) {
    throw new Error(`Concurrent index build did not produce a valid index: ${indexName}`);
  }
  const elapsedSeconds = ((performance.now() - startedAt) / 1_000).toFixed(1);
  console.log(`BUILT CONCURRENT INDEX: ${indexName} (${elapsedSeconds}s)`);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_lock(hashtext('nexus-fm-safe-migrations'))");

  const initialPublicTables = await client.query(`
    select count(*)::int as count
    from pg_tables
    where schemaname = 'public'
      and tablename not like 'pg_%'
  `);
  const databaseStartedEmpty = initialPublicTables.rows[0].count === 0;
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
  for (const migration of pending) {
    for (const statement of statements(migration.sql)) {
      if (!databaseStartedEmpty && destructivePattern.test(statement)) {
        throw new Error(`Destructive SQL refused in migration ${migration.name}`);
      }
    }
  }
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

  const migrationByHash = new Map(
    migrations.flatMap((migration) => migration.acceptedHashes.map((hash) => [hash, migration])),
  );
  for (const row of tracked.rows) {
    await client.query(
      `update drizzle.__drizzle_migrations
       set name = $1, applied_at = null
       where id = $2 and name is null`,
      [migrationByHash.get(row.hash).name, row.id],
    );
  }
  await client.query("COMMIT");

  for (const migration of pending) {
    const migrationStatements = statements(migration.sql);
    const usesConcurrentIndexes = migrationStatements.some((statement) => concurrentIndexPattern.test(statement));
    if (!usesConcurrentIndexes) await client.query("BEGIN");
    try {
      for (const statement of migrationStatements) {
        if (concurrentIndexPattern.test(statement)) {
          await runConcurrentIndexStatement(client, statement, migration.name);
        } else {
          await client.query(statement);
        }
      }
      await client.query(
        "insert into drizzle.__drizzle_migrations (hash, created_at, name) values ($1, $2, $3)",
        [migration.hash, migration.createdAt, migration.name],
      );
      if (!usesConcurrentIndexes) await client.query("COMMIT");
    } catch (error) {
      if (!usesConcurrentIndexes) await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
    console.log(`APPLIED: ${migration.name}`);
  }

  console.log(
    pending.length === 0
      ? `MIGRATIONS VERIFIED: ${migrations.length}/${migrations.length} local hashes are already applied.`
      : `MIGRATIONS APPLIED: ${pending.length}; destructive operations: none.`,
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('nexus-fm-safe-migrations'))").catch(() => undefined);
  await client.end();
}