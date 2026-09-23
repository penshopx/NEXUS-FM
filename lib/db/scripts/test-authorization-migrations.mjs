import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { rmSync } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = path.resolve(root, "../..");
const isolatedRoot = await mkdtemp(path.join(tmpdir(), "nexus-migration-regression-"));
const isolatedMigrationsRoot = path.join(isolatedRoot, "drizzle");
process.once("exit", () => rmSync(isolatedRoot, { recursive: true, force: true }));
console.log(`MIGRATION_FIXTURE_ROOT:${isolatedRoot}`);
await cp(path.join(root, "drizzle"), isolatedMigrationsRoot, { recursive: true });
if (process.argv.includes("--force-fixture-failure")) {
  throw new Error("Forced migration fixture failure after setup");
}
const priorConcurrentMigrationHash = "0cda3923e8da5682ad559b756391033ab4de3f833d9bbd26d2cee834226dde6c";
const historicalHashes = new Map([
  ["20260912024313_gray_zemo", "4d0a90859347facc4c8952cbcd24f2f4fd0cb4b16d9e3cc95fc09c56eee4b814"],
  ["20260912024336_needy_red_wolf", "07f07e46f4d6e2424aed10de7c9be6d07e98b60f19eda3aa4b75e940e5029f6e"],
  ["20260912024445_spooky_satana", "21b35d04fd4db94ab250ca063bbd6d0fd165b13483b2b0e1ed95eec413a66adc"],
  ["20260917205728_adopt_current_authorization", "b38c2b1b6f54c97f4280853ac534eb9190a52102785d23d4565ff30b164f6a7e"],
  ["20260917205823_facility_registry", "6353803f43732e75a1ac9e415ddb566b58ba40a8607eb04a8635e588d5d0c210"],
  ["20260917215906_friendly_madame_masque", "221c4d91f6e068b39330be754074fa8957f347223229103f9204ed7f82fe6182"],
]);
const migrationDirectories = (await readdir(path.join(root, "drizzle"), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^\d{14}_/.test(entry.name))
  .map((entry) => entry.name)
  .sort();
const migrations = await Promise.all(migrationDirectories.map(async (name) => {
  const sql = await readFile(path.join(root, "drizzle", name, "migration.sql"), "utf8");
  const timestamp = name.slice(0, 14);
  return {
    name,
    sql,
    hash: createHash("sha256").update(sql).digest("hex"),
    createdAt: Date.UTC(
      Number(timestamp.slice(0, 4)),
      Number(timestamp.slice(4, 6)) - 1,
      Number(timestamp.slice(6, 8)),
      Number(timestamp.slice(8, 10)),
      Number(timestamp.slice(10, 12)),
      Number(timestamp.slice(12, 14)),
    ),
  };
}));
for (const [name, expectedHash] of historicalHashes) {
  const migration = migrations.find((candidate) => candidate.name === name);
  if (!migration) throw new Error(`Historical migration is missing: ${name}`);
  if (migration.hash !== expectedHash) {
    throw new Error(`Historical migration SQL changed: ${name}`);
  }
}
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

async function apply(client, fromIndex = 0, toIndex = migrations.length) {
  for (const migration of migrations.slice(fromIndex, toIndex)) {
    for (const statement of statements(migration.sql)) await client.query(statement);
  }
}

async function createLegacyMigrationJournal(client) {
  await client.query("create schema drizzle");
  await client.query(`
    create table drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `);
  for (const migration of migrations.filter(({ name }) => historicalHashes.has(name))) {
    await client.query(
      "insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)",
      [historicalHashes.get(migration.name), migration.createdAt],
    );
  }
}

async function assertUpgradedMigrationJournal(client) {
  const columns = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'drizzle'
      and table_name = '__drizzle_migrations'
      and column_name in ('name', 'applied_at')
    order by column_name
  `);
  if (columns.rowCount !== 2) throw new Error("legacy-journal: new journal columns are missing");

  const rows = await client.query(`
    select hash, name
    from drizzle.__drizzle_migrations
    order by created_at, id
  `);
  if (rows.rowCount !== migrations.length) {
    throw new Error(`legacy-journal: expected ${migrations.length} rows, found ${rows.rowCount}`);
  }
  const expected = migrations.map(({ hash, name }) => ({ hash, name }));
  if (JSON.stringify(rows.rows) !== JSON.stringify(expected)) {
    throw new Error("legacy-journal: migration hashes or names changed during upgrade");
  }
}

async function assertConcurrentSearchIndexes(client, label) {
  const expected = migrations.flatMap(({ sql }) => (
    [...sql.matchAll(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+"([^"]+)"/gi)]
      .map((match) => match[1])
  ));
  const result = await client.query(`
    select index_class.relname as name, index_record.indisvalid as valid
    from pg_class index_class
    join pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
    join pg_index index_record on index_record.indexrelid = index_class.oid
    where index_namespace.nspname = current_schema()
      and index_class.relname = any($1::text[])
  `, [expected]);
  const valid = new Set(result.rows.filter((row) => row.valid).map((row) => row.name));
  const invalidOrMissing = expected.filter((name) => !valid.has(name));
  if (invalidOrMissing.length > 0) {
    throw new Error(`${label}: concurrent search indexes missing or invalid: ${invalidOrMissing.join(", ")}`);
  }
}

async function assertUnknownLegacyJournalUnchanged(client, unknownHash) {
  const columns = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'drizzle'
      and table_name = '__drizzle_migrations'
    order by ordinal_position
  `);
  const expectedColumns = ["id", "hash", "created_at"];
  if (JSON.stringify(columns.rows.map(({ column_name }) => column_name)) !== JSON.stringify(expectedColumns)) {
    throw new Error("unknown-legacy-journal: journal columns changed after verification failure");
  }

  const rows = await client.query(`
    select id, hash, created_at
    from drizzle.__drizzle_migrations
    order by id
  `);
  if (
    rows.rowCount !== 1
    || rows.rows[0].hash !== unknownHash
    || rows.rows[0].created_at !== "0"
  ) {
    throw new Error("unknown-legacy-journal: journal rows changed after verification failure");
  }

  const publicObjects = await client.query(`
    select count(*)::int as count
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relkind in ('r', 'p', 'v', 'm', 'S')
  `);
  if (publicObjects.rows[0].count !== 0) {
    throw new Error("unknown-legacy-journal: migration SQL ran before verification failure");
  }
}

async function assertReorderedLegacyJournalUnchanged(client, trackedMigration) {
  const columns = await client.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'drizzle'
      and table_name = '__drizzle_migrations'
    order by ordinal_position
  `);
  const expectedColumns = ["id", "hash", "created_at"];
  if (JSON.stringify(columns.rows.map(({ column_name }) => column_name)) !== JSON.stringify(expectedColumns)) {
    throw new Error("reordered-legacy-journal: journal columns changed after verification failure");
  }

  const rows = await client.query(`
    select id, hash, created_at
    from drizzle.__drizzle_migrations
    order by id
  `);
  if (
    rows.rowCount !== 1
    || rows.rows[0].id !== 1
    || rows.rows[0].hash !== trackedMigration.hash
    || rows.rows[0].created_at !== String(trackedMigration.createdAt)
  ) {
    throw new Error("reordered-legacy-journal: journal rows changed after verification failure");
  }

  const publicObjects = await client.query(`
    select count(*)::int as count
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relkind in ('r', 'p', 'v', 'm', 'S')
  `);
  if (publicObjects.rows[0].count !== 0) {
    throw new Error("reordered-legacy-journal: migration SQL ran before verification failure");
  }
}

async function bootstrapMigrations(url) {
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query("create schema if not exists drizzle");
    await client.query(`
      create table if not exists drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `);
    const tracked = await client.query("select hash from drizzle.__drizzle_migrations");
    const applied = new Set(tracked.rows.map(({ hash }) => hash));
    for (const migration of migrations) {
      if (applied.has(migration.hash)) continue;
      for (const statement of statements(migration.sql)) await client.query(statement);
      await client.query(
        "insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)",
        [migration.hash, migration.createdAt],
      );
    }
  } finally {
    await client.end();
  }
}

async function runMigrations(url) {
  await exec("pnpm", ["run", "migrate"], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: url.toString(),
      NEXUS_MIGRATIONS_ROOT: isolatedMigrationsRoot,
    },
  });
}

async function runSafeMigrations(url) {
  return exec("node", ["./scripts/migrate-safe.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: url.toString(),
      NEXUS_MIGRATIONS_ROOT: isolatedMigrationsRoot,
    },
  });
}

function assertConcurrentIndexProgress(output, indexName, label) {
  const start = `BUILDING CONCURRENT INDEX: ${indexName}`;
  const completionPattern = new RegExp(
    `BUILT CONCURRENT INDEX: ${indexName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(\\d+\\.\\d+s\\)`,
  );
  const startPosition = output.indexOf(start);
  const completionMatch = output.match(completionPattern);
  if (startPosition < 0 || !completionMatch) {
    throw new Error(`${label}: missing distinct start or elapsed-time completion output for ${indexName}`);
  }
  if (startPosition >= output.indexOf(completionMatch[0])) {
    throw new Error(`${label}: completion output preceded build start for ${indexName}`);
  }
}

function runSafeMigrationsUntilOutput(url, expectedOutput) {
  const child = spawn("node", ["./scripts/migrate-safe.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: url.toString(),
      NEXUS_MIGRATIONS_ROOT: isolatedMigrationsRoot,
    },
  });
  let output = "";
  let outputSeen = false;
  let resolveOutput;
  let rejectOutput;
  const started = new Promise((resolve, reject) => {
    resolveOutput = resolve;
    rejectOutput = reject;
  });
  const completion = new Promise((resolve, reject) => {
    const collect = (chunk) => {
      output += chunk.toString();
      if (!outputSeen && output.includes(expectedOutput)) {
        outputSeen = true;
        resolveOutput();
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", (error) => {
      rejectOutput(error);
      reject(error);
    });
    child.once("close", (code) => {
      if (code !== 0) {
        const error = new Error(`Safe migration runner exited with code ${code}: ${output}`);
        rejectOutput(error);
        reject(error);
        return;
      }
      if (!outputSeen) {
        rejectOutput(new Error(`Safe migration runner did not emit ${expectedOutput}: ${output}`));
      }
      resolve(output);
    });
  });
  return { child, started, completion };
}

async function waitForActiveIndexBuild(client, migrationState, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (migrationState.error) throw migrationState.error;
    const result = await client.query(`
      select 1
      from pg_locks table_lock
      join pg_class indexed_table on indexed_table.oid = table_lock.relation
      where indexed_table.relname = 'assets'
        and (
          (
            table_lock.mode = 'ShareUpdateExclusiveLock'
            and table_lock.granted
            and exists (
              select 1
              from pg_locks transaction_wait
              where transaction_wait.pid = table_lock.pid
                and transaction_wait.locktype = 'virtualxid'
                and not transaction_wait.granted
            )
          )
          or (
            table_lock.mode = 'ShareLock'
            and not table_lock.granted
          )
        )
    `);
    if (result.rowCount > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const activity = await client.query(`
    select state, wait_event_type, wait_event, query
    from pg_stat_activity
    where datname = current_database()
      and pid <> pg_backend_pid()
    order by pid
  `);
  throw new Error(
    `concurrent-write: search index build did not become active; activity=${JSON.stringify(activity.rows)}`,
  );
}

async function waitForMigrationLocksReleased(client, timeoutMs = 1_500) {
  const deadline = Date.now() + timeoutMs;
  let lastIndexLocks = [];
  while (Date.now() < deadline) {
    const advisoryLock = await client.query(`
      select pg_try_advisory_lock(hashtext('nexus-fm-safe-migrations')) as acquired
    `);
    if (advisoryLock.rows[0]?.acquired) {
      const lingeringIndexLocks = await client.query(`
        select lock_record.mode, lock_record.granted
        from pg_locks lock_record
        join pg_class locked_relation on locked_relation.oid = lock_record.relation
        where locked_relation.relname = 'assets'
          and lock_record.mode in ('ShareUpdateExclusiveLock', 'ShareLock')
      `);
      await client.query(
        "select pg_advisory_unlock(hashtext('nexus-fm-safe-migrations'))",
      );
      lastIndexLocks = lingeringIndexLocks.rows;
      if (lingeringIndexLocks.rowCount === 0) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(
    `interrupted-concurrent: migration locks survived cancellation; indexLocks=${JSON.stringify(lastIndexLocks)}`,
  );
}

async function assertRegistryWritesRemainAvailableDuringConcurrentIndex(target) {
  const concurrentMigrationIndex = migrations.findIndex(({ sql }) => (
    /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i.test(sql)
  ));
  if (concurrentMigrationIndex < 0) {
    throw new Error("concurrent-write: concurrent migration is missing");
  }

  await apply(target.client, 0, concurrentMigrationIndex);
  await createLegacyMigrationJournal(target.client);

  const organization = await target.client.query(`
    insert into organizations (name, slug)
    values ('Concurrent Write Check', $1)
    returning id
  `, [`concurrent-write-${randomUUID()}`]);
  const facility = await target.client.query(`
    insert into facilities (organization_id, name, code)
    values ($1, 'Concurrent Write Facility', 'CONCURRENT')
    returning id
  `, [organization.rows[0].id]);
  const building = await target.client.query(`
    insert into buildings (organization_id, facility_id, name, code)
    values ($1, $2, 'Concurrent Write Building', 'CONCURRENT')
    returning id
  `, [organization.rows[0].id, facility.rows[0].id]);
  const space = await target.client.query(`
    insert into spaces (organization_id, facility_id, building_id, name, code)
    values ($1, $2, $3, 'Concurrent Write Space', 'CONCURRENT')
    returning id
  `, [organization.rows[0].id, facility.rows[0].id, building.rows[0].id]);
  const system = await target.client.query(`
    insert into systems (organization_id, facility_id, building_id, space_id, name, code)
    values ($1, $2, $3, $4, 'Concurrent Write System', 'CONCURRENT')
    returning id
  `, [
    organization.rows[0].id,
    facility.rows[0].id,
    building.rows[0].id,
    space.rows[0].id,
  ]);
  const assetScope = [
    organization.rows[0].id,
    facility.rows[0].id,
    building.rows[0].id,
    space.rows[0].id,
    system.rows[0].id,
  ];

  const blocker = new pg.Client({ connectionString: target.url.toString() });
  const writer = new pg.Client({ connectionString: target.url.toString() });
  await Promise.all([blocker.connect(), writer.connect()]);
  let migrationPromise;
  try {
    await blocker.query("begin");
    await blocker.query(`
      insert into assets (
        organization_id, facility_id, building_id, space_id, system_id, name, code
      )
      values ($1, $2, $3, $4, $5, 'Index Build Blocker', 'BLOCKER')
    `, assetScope);

    const migrationState = { error: undefined };
    migrationPromise = runSafeMigrations(target.url).catch((error) => {
      migrationState.error = error;
      throw error;
    });
    await waitForActiveIndexBuild(target.client, migrationState);

    await writer.query("set statement_timeout = '1500ms'");
    await writer.query(`
      insert into assets (
        organization_id, facility_id, building_id, space_id, system_id, name, code
      )
      values ($1, $2, $3, $4, $5, 'Write During Index Build', 'WRITER')
    `, assetScope);

    const stillBuilding = await target.client.query(`
      select 1
      from pg_locks table_lock
      join pg_class indexed_table on indexed_table.oid = table_lock.relation
      where indexed_table.relname = 'assets'
        and table_lock.mode = 'ShareUpdateExclusiveLock'
        and table_lock.granted
        and exists (
          select 1
          from pg_locks transaction_wait
          where transaction_wait.pid = table_lock.pid
            and transaction_wait.locktype = 'virtualxid'
            and not transaction_wait.granted
        )
    `);
    if (stillBuilding.rowCount === 0) {
      throw new Error("concurrent-write: registry write did not finish before the index build");
    }

    await blocker.query("commit");
    const migrationResult = await migrationPromise;
    migrationPromise = undefined;
    assertConcurrentIndexProgress(
      `${migrationResult.stdout ?? ""}\n${migrationResult.stderr ?? ""}`,
      "assets_name_trgm_idx",
      "concurrent-write",
    );
    console.log("MIGRATION_AUTHORIZATION_CHECK_PASS:concurrent-write");
  } finally {
    await blocker.query("rollback").catch(() => undefined);
    await Promise.all([
      blocker.end().catch(() => undefined),
      writer.end().catch(() => undefined),
    ]);
    if (migrationPromise) await migrationPromise.catch(() => undefined);
  }
}

async function assertUnsafeMigrationIsAtomic(target) {
  const fixtureName = "29990101000000_unsafe_atomicity_fixture";
  const fixtureDirectory = path.join(isolatedMigrationsRoot, fixtureName);
  const fixtureSql = `
    create table unsafe_atomicity_fixture (id integer primary key);
    --> statement-breakpoint
    delete from unsafe_atomicity_fixture;
  `;
  const fixtureHash = createHash("sha256").update(fixtureSql).digest("hex");

  await runSafeMigrations(target.url);
  await mkdir(fixtureDirectory);
  await writeFile(path.join(fixtureDirectory, "migration.sql"), fixtureSql);
  try {
    try {
      await runSafeMigrations(target.url);
      throw new Error("unsafe-atomicity: safe migration unexpectedly succeeded");
    } catch (error) {
      const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}\n${error.message ?? ""}`;
      const expected = `Destructive SQL refused in migration ${fixtureName}`;
      if (!output.includes(expected)) {
        throw new Error(`unsafe-atomicity: expected safety error, received:\n${output}`);
      }
    }

    const harmlessTable = await target.client.query(
      "select to_regclass('public.unsafe_atomicity_fixture') as name",
    );
    if (harmlessTable.rows[0]?.name !== null) {
      throw new Error("unsafe-atomicity: harmless schema change survived refused migration");
    }
    const journal = await target.client.query(
      "select count(*)::int as count from drizzle.__drizzle_migrations where hash = $1",
      [fixtureHash],
    );
    if (journal.rows[0].count !== 0) {
      throw new Error("unsafe-atomicity: refused migration was recorded in the journal");
    }
    console.log("MIGRATION_AUTHORIZATION_CHECK_PASS:unsafe-atomicity");
  } finally {
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
}

async function assertFailedConcurrentIndexBatchRemainsUntracked(target) {
  const fixtureName = "29990101000001_failed_concurrent_index_batch_fixture";
  const fixtureDirectory = path.join(isolatedMigrationsRoot, fixtureName);
  const firstIndexName = "failed_concurrent_batch_lookup_idx";
  const secondIndexName = "failed_concurrent_batch_unique_idx";
  const fixtureSql = `
    create index concurrently "${firstIndexName}"
      on failed_concurrent_batch_fixture (lookup_value);
    --> statement-breakpoint
    create unique index concurrently "${secondIndexName}"
      on failed_concurrent_batch_fixture (unique_value);
  `;
  const fixtureHash = createHash("sha256").update(fixtureSql).digest("hex");

  await runSafeMigrations(target.url);
  await target.client.query(`
    create table failed_concurrent_batch_fixture (
      id integer primary key,
      lookup_value integer not null,
      unique_value integer not null
    )
  `);
  await target.client.query(`
    insert into failed_concurrent_batch_fixture (id, lookup_value, unique_value)
    values (1, 10, 20), (2, 11, 20)
  `);
  await mkdir(fixtureDirectory);
  await writeFile(path.join(fixtureDirectory, "migration.sql"), fixtureSql);

  try {
    try {
      await runSafeMigrations(target.url);
      throw new Error("failed-concurrent-batch: safe migration unexpectedly succeeded");
    } catch (error) {
      const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}\n${error.message ?? ""}`;
      if (
        !output.includes(`could not create unique index "${secondIndexName}"`)
        || !output.includes("is duplicated")
      ) {
        throw new Error(`failed-concurrent-batch: expected later index failure, received:\n${output}`);
      }
    }

    const interruptedIndexes = await target.client.query(`
      select index_class.relname as name, index_record.indisvalid as valid
      from pg_class index_class
      join pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
      join pg_index index_record on index_record.indexrelid = index_class.oid
      where index_namespace.nspname = current_schema()
        and index_class.relname = any($1::text[])
      order by index_class.relname
    `, [[firstIndexName, secondIndexName]]);
    const interruptedByName = new Map(
      interruptedIndexes.rows.map(({ name, valid }) => [name, valid]),
    );
    if (interruptedByName.get(firstIndexName) !== true) {
      throw new Error("failed-concurrent-batch: earlier index did not survive the interrupted batch");
    }
    if (interruptedByName.get(secondIndexName) !== false) {
      throw new Error("failed-concurrent-batch: later failed index was not left invalid");
    }

    const failedJournal = await target.client.query(
      "select count(*)::int as count from drizzle.__drizzle_migrations where hash = $1",
      [fixtureHash],
    );
    if (failedJournal.rows[0].count !== 0) {
      throw new Error("failed-concurrent-batch: failed migration was recorded in the journal");
    }

    await target.client.query(
      "update failed_concurrent_batch_fixture set unique_value = 21 where id = 2",
    );
    await runSafeMigrations(target.url);

    const recoveredIndexes = await target.client.query(`
      select index_class.relname as name, index_record.indisvalid as valid
      from pg_class index_class
      join pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
      join pg_index index_record on index_record.indexrelid = index_class.oid
      where index_namespace.nspname = current_schema()
        and index_class.relname = any($1::text[])
      order by index_class.relname
    `, [[firstIndexName, secondIndexName]]);
    if (
      recoveredIndexes.rowCount !== 2
      || recoveredIndexes.rows.some(({ valid }) => valid !== true)
    ) {
      throw new Error("failed-concurrent-batch: retry did not leave both indexes valid");
    }

    const recoveredJournal = await target.client.query(
      "select count(*)::int as count from drizzle.__drizzle_migrations where hash = $1",
      [fixtureHash],
    );
    if (recoveredJournal.rows[0].count !== 1) {
      throw new Error("failed-concurrent-batch: recovered migration was not tracked exactly once");
    }
    console.log("MIGRATION_AUTHORIZATION_CHECK_PASS:failed-concurrent-batch");
  } finally {
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
}

async function assertCompletedConcurrentIndexesRecoverAfterJournalFailure(target) {
  const label = "completed-concurrent-journal-failure";
  const fixtureName = "29990101000002_completed_concurrent_journal_failure_fixture";
  const fixtureDirectory = path.join(isolatedMigrationsRoot, fixtureName);
  const indexNames = [
    "completed_concurrent_journal_lookup_idx",
    "completed_concurrent_journal_unique_idx",
  ];
  const fixtureSql = `
    create index concurrently "${indexNames[0]}"
      on completed_concurrent_journal_fixture (lookup_value);
    --> statement-breakpoint
    create unique index concurrently "${indexNames[1]}"
      on completed_concurrent_journal_fixture (unique_value);
  `;
  const fixtureHash = createHash("sha256").update(fixtureSql).digest("hex");

  async function indexes() {
    const result = await target.client.query(`
      select index_class.relname as name, index_class.oid::text as oid,
             index_record.indisvalid as valid
      from pg_class index_class
      join pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
      join pg_index index_record on index_record.indexrelid = index_class.oid
      where index_namespace.nspname = current_schema()
        and index_class.relname = any($1::text[])
      order by index_class.relname
    `, [indexNames]);
    if (
      result.rowCount !== indexNames.length
      || result.rows.some(({ valid }) => valid !== true)
    ) {
      throw new Error(`${label}: expected both completed indexes to be valid`);
    }
    return result.rows;
  }

  async function journalCount() {
    const result = await target.client.query(
      "select count(*)::int as count from drizzle.__drizzle_migrations where hash = $1",
      [fixtureHash],
    );
    return result.rows[0].count;
  }

  await runSafeMigrations(target.url);
  await target.client.query(`
    create table completed_concurrent_journal_fixture (
      lookup_value integer not null,
      unique_value integer not null
    )
  `);
  await mkdir(fixtureDirectory);
  await writeFile(path.join(fixtureDirectory, "migration.sql"), fixtureSql);
  try {
    await target.client.query(`
      create function reject_completed_concurrent_journal() returns trigger
      language plpgsql as $$
      begin
        if new.hash = '${fixtureHash}' then
          if (
            select count(*)
            from pg_class index_class
            join pg_namespace index_namespace on index_namespace.oid = index_class.relnamespace
            join pg_index index_record on index_record.indexrelid = index_class.oid
            where index_namespace.nspname = 'public'
              and index_class.relname in ('${indexNames[0]}', '${indexNames[1]}')
              and index_record.indisvalid
          ) <> 2 then
            raise exception 'journal rejection reached before both indexes were valid';
          end if;
          raise exception 'deliberate completed-index journal rejection';
        end if;
        return new;
      end;
      $$
    `);
    await target.client.query(`
      create trigger reject_completed_concurrent_journal_insert
      before insert on drizzle.__drizzle_migrations
      for each row execute function reject_completed_concurrent_journal()
    `);

    let failure;
    try {
      await runSafeMigrations(target.url);
    } catch (error) {
      failure = error;
    }
    if (!failure) throw new Error(`${label}: journal write unexpectedly succeeded`);
    const output = `${failure.stdout ?? ""}\n${failure.stderr ?? ""}\n${failure.message ?? ""}`;
    if (!output.includes("deliberate completed-index journal rejection")) {
      throw new Error(`${label}: expected journal rejection, received:\n${output}`);
    }
    for (const indexName of indexNames) {
      assertConcurrentIndexProgress(output, indexName, label);
    }
    const completedIndexes = await indexes();
    if (await journalCount() !== 0) {
      throw new Error(`${label}: rejected migration was tracked`);
    }

    await target.client.query(
      "drop trigger reject_completed_concurrent_journal_insert on drizzle.__drizzle_migrations",
    );
    await target.client.query("drop function reject_completed_concurrent_journal()");
    const retry = await runSafeMigrations(target.url);
    const retryOutput = `${retry.stdout ?? ""}\n${retry.stderr ?? ""}`;
    if (indexNames.some((name) => retryOutput.includes(`BUILDING CONCURRENT INDEX: ${name}`))) {
      throw new Error(`${label}: retry rebuilt an already valid index`);
    }
    if (JSON.stringify(await indexes()) !== JSON.stringify(completedIndexes)) {
      throw new Error(`${label}: retry did not preserve the completed indexes`);
    }
    if (await journalCount() !== 1) {
      throw new Error(`${label}: retry did not track the migration exactly once`);
    }
    await runSafeMigrations(target.url);
    if (await journalCount() !== 1) {
      throw new Error(`${label}: another retry duplicated the journal row`);
    }
    console.log(`MIGRATION_AUTHORIZATION_CHECK_PASS:${label}`);
  } finally {
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
}

async function verifyMigrations(url) {
  await exec("node", ["./scripts/verify-migrations-applied.mjs"], {
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
    env: {
      ...process.env,
      DATABASE_URL: url.toString(),
      NEXUS_MIGRATIONS_ROOT: isolatedMigrationsRoot,
    },
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

async function seedCatalog(url, client) {
  const roleColumn = await client.query(`
    select exists (
      select 1 from information_schema.columns
      where table_name='role_permissions' and column_name='role'
    ) as present
  `);
  const historicalUuidShape = !roleColumn.rows[0].present;
  if (historicalUuidShape) {
    await client.query(`
      alter table role_permissions add column role canonical_role;
      alter table role_permissions alter column role_id drop not null;
    `);
  }
  await exec("node", [catalogRunner], {
    cwd: workspace,
    env: { ...process.env, DATABASE_URL: url.toString() },
  });
  if (historicalUuidShape) {
    await client.query(`
      update role_permissions rp
        set role_id = ar.id
        from authorization_roles ar
        where ar.code::canonical_role = rp.role
          and rp.role_id is null;
      alter table role_permissions drop column role;
      alter table role_permissions alter column role_id set not null;
    `);
  }
}

async function convertToLegacyProductionShape(client) {
  await client.query(`
    begin;
    do $$ begin
      create type permission_effect as enum ('ALLOW', 'DENY');
    exception when duplicate_object then null;
    end $$;
    do $$ begin
      create type permission_status as enum ('ACTIVE', 'DEPRECATED');
    exception when duplicate_object then null;
    end $$;
    do $$ begin
      create type binding_status as enum ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED');
    exception when duplicate_object then null;
    end $$;
    do $$ begin
      create type scope_type as enum ('PLATFORM', 'ORGANIZATION', 'PORTFOLIO', 'FACILITY', 'BUILDING', 'SPACE', 'ASSET', 'ASSIGNED', 'TEAM', 'VENDOR_ASSIGNMENT', 'OWNED_REQUEST');
    exception when duplicate_object then null;
    end $$;
    alter table role_permissions drop constraint if exists role_permissions_role_id_authorization_roles_id_fk;
    alter table user_role_bindings drop constraint if exists user_role_bindings_role_id_authorization_roles_id_fk;
    alter table role_permissions drop constraint if exists role_permissions_role_permission_scope_unique;
    alter table user_role_bindings drop constraint if exists user_role_binding_unique;
    drop index if exists role_permission_scope_unique;
    drop index if exists user_role_binding_unique;
    alter table role_permissions add column role_legacy canonical_role;
    update role_permissions rp
      set role_legacy = ar.code::canonical_role
      from authorization_roles ar
      where ar.id = rp.role_id;
    alter table role_permissions alter column role_legacy set not null;
    alter table role_permissions drop column role_id;
    alter table role_permissions rename column role_legacy to role;
    alter table user_role_bindings add column role_legacy canonical_role;
    update user_role_bindings ub
      set role_legacy = ar.code::canonical_role
      from authorization_roles ar
      where ar.id = ub.role_id;
    alter table user_role_bindings alter column role_legacy set not null;
    alter table user_role_bindings drop column role_id;
    alter table user_role_bindings rename column role_legacy to role;
    alter table role_permissions
      alter column effect drop default;
    alter table user_role_bindings
      alter column status drop default;
    alter table permissions
      alter column status drop default;
    alter table role_permissions
      alter column default_scope_type type scope_type using default_scope_type::text::scope_type,
      alter column effect type permission_effect using effect::text::permission_effect;
    alter table user_role_bindings
      alter column scope_type type scope_type using scope_type::text::scope_type,
      alter column status type binding_status using status::text::binding_status;
    alter table permissions
      alter column status type permission_status using status::text::permission_status;
    alter table role_permissions alter column effect set default 'ALLOW'::permission_effect;
    alter table user_role_bindings alter column status set default 'ACTIVE'::binding_status;
    alter table permissions alter column status set default 'ACTIVE'::permission_status;
    alter table authorization_audit_logs
      add column role canonical_role,
      add column permission text not null default '',
      add column request_context jsonb not null default '{}'::jsonb;
    alter table authorization_audit_logs
      alter column decision type permission_effect
      using decision::permission_effect;
    create unique index role_permission_scope_unique
      on role_permissions (role, permission_id, default_scope_type);
    create unique index user_role_binding_unique
      on user_role_bindings (user_id, organization_id, role, scope_type, scope_id);
    commit;
  `);
}

async function seedAndCheck(client, url, label) {
  await assertConcurrentSearchIndexes(client, label);
  const shape = await client.query(`
    select
      exists (
        select 1 from information_schema.columns
        where table_name = 'role_permissions' and column_name = 'role'
      ) as legacy
  `);
  const legacy = shape.rows[0].legacy;
  const requiredColumns = {
    users: ["is_active"],
    organizations: ["is_active"],
    memberships: ["is_active"],
    authorization_roles: ["id", "code", "status", "policy_version", "created_at", "updated_at"],
    role_permissions: [legacy ? "role" : "role_id", "permission_id", "default_scope_type", "effect"],
    user_role_bindings: [legacy ? "role" : "role_id", "version", "scope_type", "scope_id", "status"],
    authorization_audit_logs: legacy
      ? ["role", "permission", "request_context", "resource", "resource_id", "decision", "reason_code"]
      : ["action", "resource", "resource_id", "decision", "reason_code", "request_id", "before_state", "after_state"],
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
  if (!legacy && foreignKeys.rowCount !== 2) throw new Error(`${label}: authorization role foreign keys missing`);
  const bindingUnique = await client.query(`
    select pg_get_constraintdef(oid) as definition
    from pg_constraint where conname='user_role_binding_unique'
  `);
  if (!legacy && !bindingUnique.rows[0]?.definition.includes("NULLS NOT DISTINCT")) {
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
  if (legacy) {
    const legacyEnum = await client.query(`
      select array_agg(enumlabel order by enumsortorder)::text[] as labels
      from pg_type join pg_enum on pg_enum.enumtypid=pg_type.oid
      join pg_namespace on pg_namespace.oid=pg_type.typnamespace
      where pg_namespace.nspname='public' and typname='binding_status'
      group by typname
    `);
    if (JSON.stringify(legacyEnum.rows[0]?.labels) !== JSON.stringify(["ACTIVE", "SUSPENDED", "EXPIRED", "REVOKED"])) {
      throw new Error(`${label}: legacy binding lifecycle enum was not preserved`);
    }
  } else {
    if (JSON.stringify(enumLabels.get("authorization_binding_status")) !== JSON.stringify(["ACTIVE", "SUSPENDED", "EXPIRED"])) {
      throw new Error(`${label}: binding lifecycle enum is not current`);
    }
    if (enumLabels.get("authorization_binding_status")?.includes("REVOKED")) {
      throw new Error(`${label}: obsolete REVOKED lifecycle remains`);
    }
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
  await client.query(
    legacy
      ? `insert into role_permissions (role, permission_id, default_scope_type, effect)
         values ($1, $2, 'ORGANIZATION', 'ALLOW') on conflict do nothing`
      : `insert into role_permissions (role_id, permission_id, default_scope_type, effect)
         values ($1, $2, 'ORGANIZATION', 'ALLOW') on conflict do nothing`,
    [legacy ? manager.code : manager.id, permission.rows[0].id],
  );
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
    `insert into user_role_bindings (user_id, organization_id, ${legacy ? "role" : "role_id"}, scope_type, granted_by)
     values ($1,$2,$3,'ORGANIZATION',$1)`,
    [user.rows[0].id, organization.rows[0].id, legacy ? manager.code : manager.id],
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
  const decision = await client.query(
    legacy
      ? `select p.code, rp.effect from user_role_bindings b
         join role_permissions rp on rp.role = b.role
         join permissions p on p.id = rp.permission_id
         where b.user_id = $1 and b.organization_id = $2
           and b.status = 'ACTIVE' and p.code = 'ORGANIZATION.VIEW'`
      : `select p.code, rp.effect from user_role_bindings b
         join authorization_roles r on r.id = b.role_id
         join role_permissions rp on rp.role_id = r.id
         join permissions p on p.id = rp.permission_id
         where b.user_id = $1 and b.organization_id = $2
           and b.status = 'ACTIVE' and p.code = 'ORGANIZATION.VIEW'`,
    [user.rows[0].id, organization.rows[0].id],
  );
  if (decision.rows[0]?.effect !== "ALLOW") throw new Error(`${label}: representative authorization query failed`);
  const roleColumn = legacy ? "role" : "role_id";
  const roleValue = legacy ? manager.code : manager.id;
  await client.query(
    `update role_permissions set effect='DENY' where ${roleColumn}=$1 and permission_id=$2`,
    [roleValue, permission.rows[0].id],
  );
  const deny = await client.query(
    `select effect from role_permissions where ${roleColumn}=$1 and permission_id=$2`,
    [roleValue, permission.rows[0].id],
  );
  if (deny.rows[0]?.effect !== "DENY") throw new Error(`${label}: explicit deny persistence failed`);
  try {
    const duplicate = await client.query(
      `insert into user_role_bindings (user_id, organization_id, ${legacy ? "role" : "role_id"}, scope_type, granted_by)
       values ($1,$2,$3,'ORGANIZATION',$1) returning id`,
      [user.rows[0].id, organization.rows[0].id, roleValue],
    );
    if (!legacy) throw new Error(`${label}: NULLS NOT DISTINCT uniqueness failed`);
    await client.query("delete from user_role_bindings where id = $1", [duplicate.rows[0]?.id]);
  } catch (error) {
    if (error.code !== "23505") throw error;
    if (legacy) throw new Error(`${label}: legacy uniqueness changed unexpectedly`);
  }
  const beforePostMerge = await snapshotPreservedData(client);
  await runPostMerge(url);
  const afterPostMerge = await snapshotPreservedData(client);
  if (JSON.stringify(afterPostMerge) !== JSON.stringify(beforePostMerge)) {
    throw new Error(`${label}: post-merge reconciliation changed preserved data`);
  }
  if (legacy) {
    const beforeReconciliation = await snapshotPreservedData(client);
    await reconcileSchema(url);
    const afterReconciliation = await snapshotPreservedData(client);
    if (JSON.stringify(afterReconciliation) !== JSON.stringify(beforeReconciliation)) {
      throw new Error(`${label}: schema reconciliation changed preserved data`);
    }
    const schemaAfterReconciliation = await snapshotAuthorizationSchema(client);
    if (!schemaAfterReconciliation.some((row) => row.constraint_name === "user_role_binding_unique")) {
      throw new Error(`${label}: schema reconciliation removed binding uniqueness`);
    }
  }
  console.log(`MIGRATION_AUTHORIZATION_CHECK_PASS:${label}`);
}

async function cleanup(target) {
  await target.client.end().catch(() => undefined);
  await admin.query(`DROP DATABASE IF EXISTS "${target.database}"`);
}

try {
  const concurrentWrite = await createTarget("concurrent_write");
  try {
    await assertRegistryWritesRemainAvailableDuringConcurrentIndex(concurrentWrite);
  } finally {
    await cleanup(concurrentWrite);
  }

  const unsafeAtomicity = await createTarget("unsafe_atomicity");
  try {
    await assertUnsafeMigrationIsAtomic(unsafeAtomicity);
  } finally {
    await cleanup(unsafeAtomicity);
  }

  const failedConcurrentBatch = await createTarget("failed_concurrent_batch");
  try {
    await assertFailedConcurrentIndexBatchRemainsUntracked(failedConcurrentBatch);
  } finally {
    await cleanup(failedConcurrentBatch);
  }

  const completedConcurrentJournal = await createTarget("completed_concurrent_journal");
  try {
    await assertCompletedConcurrentIndexesRecoverAfterJournalFailure(completedConcurrentJournal);
  } finally {
    await cleanup(completedConcurrentJournal);
  }

  const empty = await createTarget("empty");
  try {
    await runMigrations(empty.url);
    await seedCatalog(empty.url, empty.client);
    await seedAndCheck(empty.client, empty.url, "empty");
  } finally {
    await cleanup(empty);
  }

  const legacyCompatible = await createTarget("legacy_compatible");
  try {
    await runMigrations(legacyCompatible.url);
    await convertToLegacyProductionShape(legacyCompatible.client);
    await seedCatalog(legacyCompatible.url, legacyCompatible.client);
    await seedAndCheck(legacyCompatible.client, legacyCompatible.url, "legacy-compatible");
  } finally {
    await cleanup(legacyCompatible);
  }

  const adopted = await createTarget("adopted");
  try {
    for (const statement of statements(migrations[0].sql)) await adopted.client.query(statement);
    await exec("node", ["./scripts/adopt-foundation-baseline.mjs"], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: adopted.url.toString() },
    });
    await bootstrapMigrations(adopted.url);
    await seedCatalog(adopted.url, adopted.client);
    await seedAndCheck(adopted.client, adopted.url, "task01-adopted");
  } finally {
    await cleanup(adopted);
  }

  const legacyJournal = await createTarget("legacy_journal");
  try {
    await apply(legacyJournal.client, 0, historicalHashes.size);
    await createLegacyMigrationJournal(legacyJournal.client);
    await runPostMerge(legacyJournal.url);
    await assertUpgradedMigrationJournal(legacyJournal.client);
    await seedCatalog(legacyJournal.url, legacyJournal.client);
    await seedAndCheck(legacyJournal.client, legacyJournal.url, "legacy-journal");
  } finally {
    await cleanup(legacyJournal);
  }

  const interruptedConcurrent = await createTarget("interrupted_concurrent");
  try {
    const concurrentMigrationIndex = migrations.findIndex(({ sql }) => (
      /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i.test(sql)
    ));
    if (concurrentMigrationIndex < 0) {
      throw new Error("interrupted-concurrent: concurrent migration is missing");
    }
    const concurrentMigration = migrations[concurrentMigrationIndex];
    await apply(interruptedConcurrent.client, 0, concurrentMigrationIndex);
    await interruptedConcurrent.client.query("create schema drizzle");
    await interruptedConcurrent.client.query(`
      create table drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `);
    for (const migration of migrations.slice(0, concurrentMigrationIndex)) {
      await interruptedConcurrent.client.query(
        "insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)",
        [migration.hash, migration.createdAt],
      );
    }
    const organization = await interruptedConcurrent.client.query(`
      insert into organizations (name, slug)
      values ('Interrupted Concurrent Check', $1)
      returning id
    `, [`interrupted-concurrent-${randomUUID()}`]);
    const facility = await interruptedConcurrent.client.query(`
      insert into facilities (organization_id, name, code)
      values ($1, 'Interrupted Concurrent Facility', 'INTERRUPTED')
      returning id
    `, [organization.rows[0].id]);
    const building = await interruptedConcurrent.client.query(`
      insert into buildings (organization_id, facility_id, name, code)
      values ($1, $2, 'Interrupted Concurrent Building', 'INTERRUPTED')
      returning id
    `, [organization.rows[0].id, facility.rows[0].id]);
    const space = await interruptedConcurrent.client.query(`
      insert into spaces (organization_id, facility_id, building_id, name, code)
      values ($1, $2, $3, 'Interrupted Concurrent Space', 'INTERRUPTED')
      returning id
    `, [organization.rows[0].id, facility.rows[0].id, building.rows[0].id]);
    const system = await interruptedConcurrent.client.query(`
      insert into systems (organization_id, facility_id, building_id, space_id, name, code)
      values ($1, $2, $3, $4, 'Interrupted Concurrent System', 'INTERRUPTED')
      returning id
    `, [
      organization.rows[0].id,
      facility.rows[0].id,
      building.rows[0].id,
      space.rows[0].id,
    ]);
    const assetScope = [
      organization.rows[0].id,
      facility.rows[0].id,
      building.rows[0].id,
      space.rows[0].id,
      system.rows[0].id,
    ];
    await interruptedConcurrent.client.query("create table invalid_index_fixture (value integer not null)");
    await interruptedConcurrent.client.query("insert into invalid_index_fixture (value) values (1), (1)");
    try {
      await interruptedConcurrent.client.query(`
        create unique index concurrently "assets_name_trgm_idx"
        on invalid_index_fixture (value)
      `);
      throw new Error("interrupted-concurrent: invalid index fixture unexpectedly succeeded");
    } catch (error) {
      if (error.code !== "23505") throw error;
    }

    const blocker = new pg.Client({ connectionString: interruptedConcurrent.url.toString() });
    const writer = new pg.Client({ connectionString: interruptedConcurrent.url.toString() });
    await Promise.all([blocker.connect(), writer.connect()]);
    let migrationPromise;
    try {
      await blocker.query("begin");
      await blocker.query(`
        insert into assets (
          organization_id, facility_id, building_id, space_id, system_id, name, code
        )
        values ($1, $2, $3, $4, $5, 'Interrupted Retry Blocker', 'RETRY-BLOCKER')
      `, assetScope);

      const cancelledMigrationRun = runSafeMigrationsUntilOutput(
        interruptedConcurrent.url,
        "BUILDING CONCURRENT INDEX: assets_name_trgm_idx",
      );
      const migrationState = { error: undefined };
      migrationPromise = cancelledMigrationRun.completion.catch((error) => {
        migrationState.error = error;
        throw error;
      });
      await cancelledMigrationRun.started;
      await waitForActiveIndexBuild(interruptedConcurrent.client, migrationState);

      cancelledMigrationRun.child.kill("SIGTERM");
      try {
        await migrationPromise;
        throw new Error("interrupted-concurrent: cancelled migration unexpectedly succeeded");
      } catch (error) {
        if (!error.message.includes("Safe migration runner exited with code")) throw error;
      }
      migrationPromise = undefined;

      await waitForMigrationLocksReleased(interruptedConcurrent.client);

      await writer.query("set statement_timeout = '1500ms'");
      await writer.query(`
        insert into assets (
          organization_id, facility_id, building_id, space_id, system_id, name, code
        )
        values ($1, $2, $3, $4, $5, 'Write After Cancelled Migration', 'CANCEL-WRITER')
      `, assetScope);

      const migrationRun = runSafeMigrationsUntilOutput(
        interruptedConcurrent.url,
        "RETRYING INVALID INDEX: assets_name_trgm_idx",
      );
      migrationPromise = migrationRun.completion.catch((error) => {
        throw error;
      });
      await migrationRun.started;

      await blocker.query("commit");
      const retryOutput = await migrationPromise;
      migrationPromise = undefined;
      const retryMessage = "RETRYING INVALID INDEX: assets_name_trgm_idx";
      const buildMessage = "BUILDING CONCURRENT INDEX: assets_name_trgm_idx";
      if (retryOutput.indexOf(retryMessage) < 0 || retryOutput.indexOf(retryMessage) >= retryOutput.indexOf(buildMessage)) {
        throw new Error(
          "interrupted-concurrent: retry cleanup output was missing or indistinguishable from build progress",
        );
      }
      assertConcurrentIndexProgress(
        retryOutput,
        "assets_name_trgm_idx",
        "interrupted-concurrent",
      );
    } finally {
      await blocker.query("rollback").catch(() => undefined);
      await Promise.all([
        blocker.end().catch(() => undefined),
        writer.end().catch(() => undefined),
      ]);
      if (migrationPromise) await migrationPromise.catch(() => undefined);
    }
    await assertConcurrentSearchIndexes(interruptedConcurrent.client, "interrupted-concurrent");
    const repairedIndex = await interruptedConcurrent.client.query(`
      select indexed_table.relname as table_name, index_record.indisvalid as valid
      from pg_class index_class
      join pg_index index_record on index_record.indexrelid = index_class.oid
      join pg_class indexed_table on indexed_table.oid = index_record.indrelid
      where index_class.relname = 'assets_name_trgm_idx'
    `);
    if (
      repairedIndex.rows[0]?.table_name !== "assets"
      || repairedIndex.rows[0]?.valid !== true
    ) {
      throw new Error("interrupted-concurrent: invalid index was not replaced safely");
    }
    const tracked = await interruptedConcurrent.client.query(
      "select count(*)::int as count from drizzle.__drizzle_migrations where hash = $1",
      [concurrentMigration.hash],
    );
    if (tracked.rows[0].count !== 1) {
      throw new Error("interrupted-concurrent: resumed migration was not tracked exactly once");
    }
    console.log("MIGRATION_AUTHORIZATION_CHECK_PASS:interrupted-concurrent");
  } finally {
    await cleanup(interruptedConcurrent);
  }

  const priorSearchIndexHash = await createTarget("prior_search_index_hash");
  try {
    const concurrentMigrationIndex = migrations.findIndex(({ sql }) => (
      /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/i.test(sql)
    ));
    const concurrentMigration = migrations[concurrentMigrationIndex];
    if (!concurrentMigration) throw new Error("prior-search-index-hash: migration is missing");
    await apply(priorSearchIndexHash.client, 0, concurrentMigrationIndex);
    for (const statement of statements(concurrentMigration.sql.replaceAll("INDEX CONCURRENTLY", "INDEX"))) {
      await priorSearchIndexHash.client.query(statement);
    }
    await apply(priorSearchIndexHash.client, concurrentMigrationIndex + 1);
    await priorSearchIndexHash.client.query("create schema drizzle");
    await priorSearchIndexHash.client.query(`
      create table drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `);
    for (const migration of migrations) {
      await priorSearchIndexHash.client.query(
        "insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)",
        [
          migration.name === concurrentMigration.name ? priorConcurrentMigrationHash : migration.hash,
          migration.createdAt,
        ],
      );
    }
    const before = await priorSearchIndexHash.client.query(`
      select index_class.relname as name, index_class.oid::text as oid
      from pg_class index_class
      where index_class.relname = any($1::text[])
      order by index_class.relname
    `, [concurrentMigration.sql.matchAll(/\bINDEX\s+CONCURRENTLY\s+"([^"]+)"/gi)
      .toArray().map((match) => match[1])]);
    await runSafeMigrations(priorSearchIndexHash.url);
    await verifyMigrations(priorSearchIndexHash.url);
    const after = await priorSearchIndexHash.client.query(`
      select index_class.relname as name, index_class.oid::text as oid
      from pg_class index_class
      where index_class.relname = any($1::text[])
      order by index_class.relname
    `, [before.rows.map(({ name }) => name)]);
    if (JSON.stringify(after.rows) !== JSON.stringify(before.rows)) {
      throw new Error("prior-search-index-hash: existing indexes were unexpectedly rebuilt");
    }
    console.log("MIGRATION_AUTHORIZATION_CHECK_PASS:prior-search-index-hash");
  } finally {
    await cleanup(priorSearchIndexHash);
  }

  const unknownLegacyJournal = await createTarget("unknown_legacy_journal");
  try {
    const unknownHash = "unknown-historical-migration-hash";
    await unknownLegacyJournal.client.query("create schema drizzle");
    await unknownLegacyJournal.client.query(`
      create table drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `);
    await unknownLegacyJournal.client.query(
      "insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, 0)",
      [unknownHash],
    );

    try {
      await runPostMerge(unknownLegacyJournal.url);
      throw new Error("unknown-legacy-journal: post-merge unexpectedly succeeded");
    } catch (error) {
      const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}\n${error.message ?? ""}`;
      if (!output.includes("Migration verification failed: 1 applied hash(es) are absent locally")) {
        throw new Error(`unknown-legacy-journal: expected verification error, received:\n${output}`);
      }
    }

    await assertUnknownLegacyJournalUnchanged(unknownLegacyJournal.client, unknownHash);
    console.log("MIGRATION_AUTHORIZATION_CHECK_PASS:unknown-legacy-journal");
  } finally {
    await cleanup(unknownLegacyJournal);
  }

  const reorderedLegacyJournal = await createTarget("reordered_legacy_journal");
  try {
    const trackedMigration = migrations[1];
    if (!trackedMigration) {
      throw new Error("reordered-legacy-journal: requires at least two local migrations");
    }
    await reorderedLegacyJournal.client.query("create schema drizzle");
    await reorderedLegacyJournal.client.query(`
      create table drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `);
    await reorderedLegacyJournal.client.query(
      "insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)",
      [trackedMigration.hash, trackedMigration.createdAt],
    );

    try {
      await runPostMerge(reorderedLegacyJournal.url);
      throw new Error("reordered-legacy-journal: post-merge unexpectedly succeeded");
    } catch (error) {
      const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}\n${error.message ?? ""}`;
      const expected = `Migration verification failed: applied migration ${trackedMigration.name} follows an untracked migration`;
      if (!output.includes(expected)) {
        throw new Error(`reordered-legacy-journal: expected verification error, received:\n${output}`);
      }
    }

    await assertReorderedLegacyJournalUnchanged(reorderedLegacyJournal.client, trackedMigration);
    console.log("MIGRATION_AUTHORIZATION_CHECK_PASS:reordered-legacy-journal");
  } finally {
    await cleanup(reorderedLegacyJournal);
  }
} finally {
  await admin.end();
  await unlink(catalogRunner).catch(() => undefined);
  await unlink(catalogBundle).catch(() => undefined);
  await rm(isolatedRoot, { recursive: true, force: true });
}

console.log("SCHEMA VERIFIED");
console.log("DESTRUCTIVE OPERATION: NONE");
console.log("AUTHORIZATION DATA PRESERVED");
console.log("REGRESSION: PASS");
