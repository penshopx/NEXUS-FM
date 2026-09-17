import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsRoot = path.join(root, "drizzle");
const entries = await readdir(migrationsRoot, { withFileTypes: true });
const localMigrations = [];

for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const migrationPath = path.join(migrationsRoot, entry.name, "migration.sql");
  let sql;
  try {
    sql = await readFile(migrationPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }
  localMigrations.push({
    name: entry.name,
    hash: createHash("sha256").update(sql).digest("hex"),
  });
}

if (localMigrations.length === 0) throw new Error("No local migrations were found");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

migrationCheck:
try {
  let result;
  try {
    result = await client.query(
      "select hash from drizzle.__drizzle_migrations order by created_at, id",
    );
  } catch (error) {
    if (error?.code !== "42P01" && error?.code !== "3F000") throw error;
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
    console.log("EMPTY DATABASE: normal forward migrations are required.");
    process.exitCode = 2;
    break migrationCheck;
  }

  if (result.rows.length === 0) {
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
    console.log("EMPTY DATABASE: normal forward migrations are required.");
    process.exitCode = 2;
    break migrationCheck;
  }

  const appliedHashes = new Set(result.rows.map(({ hash }) => hash));
  const missing = localMigrations.filter(({ hash }) => !appliedHashes.has(hash));
  const unknown = [...appliedHashes].filter(
    (hash) => !localMigrations.some((migration) => migration.hash === hash),
  );

  if (unknown.length > 0) {
    throw new Error(
      `Migration verification failed: ${unknown.length} applied hash(es) are absent locally`,
    );
  }

  if (missing.length > 0) {
    throw new Error(
      `Migration verification stopped: ${missing.length} local migration(s) are not tracked (${missing.map(({ name }) => name).join(", ")}). Refusing to replay historical DDL; reconcile migration ordering first.`,
    );
  }

  console.log(
    `MIGRATIONS VERIFIED: ${localMigrations.length}/${localMigrations.length} local hashes are already applied; database mutation skipped.`,
  );
} finally {
  await client.end();
}