import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const execFileAsync = promisify(execFile);
const baseline = await readFile(new URL("../drizzle/0000_gray_zemo.sql", import.meta.url), "utf8");
const cases = [
  {
    name: "altered-column",
    mutate: "ALTER TABLE users DROP COLUMN email",
    expected: "column fingerprint differs",
  },
  {
    name: "missing-constraint",
    mutate: "ALTER TABLE organizations DROP CONSTRAINT organizations_slug_unique",
    expected: "constraint fingerprint differs",
  },
  {
    name: "same-named-view",
    mutate: "DROP TABLE audit_events; CREATE VIEW audit_events AS SELECT NULL::uuid AS id",
    expected: "relations are not exact tables",
  },
  {
    name: "authorization-type",
    mutate: "CREATE TYPE permission_status AS ENUM('ACTIVE', 'DEPRECATED')",
    expected: "authorization types already exist",
  },
  {
    name: "nonempty-history",
    mutate: `
      CREATE SCHEMA drizzle;
      CREATE TABLE drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint
      );
      INSERT INTO drizzle.__drizzle_migrations(hash, created_at) VALUES ('unexpected', 1)
    `,
    expected: "migration history is not empty",
  },
];

const admin = new pg.Client({ connectionString: process.env.DATABASE_URL });
await admin.connect();
try {
  for (const testCase of cases) {
    const database = `nexus_adopt_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    await admin.query(`CREATE DATABASE ${database}`);
    const url = new URL(process.env.DATABASE_URL);
    url.pathname = `/${database}`;
    const target = new pg.Client({ connectionString: url.toString() });
    try {
      await target.connect();
      for (const statement of baseline.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
        await target.query(statement);
      }
      await target.query(testCase.mutate);
      let rejected = false;
      try {
        await execFileAsync("node", ["./scripts/adopt-foundation-baseline.mjs"], {
          cwd: new URL("..", import.meta.url),
          env: { ...process.env, DATABASE_URL: url.toString() },
        });
      } catch (error) {
        rejected = String(error.stderr).includes(testCase.expected);
      }
      if (!rejected) throw new Error(`Adoption refusal failed for ${testCase.name}`);
      const relation = await target.query(
        "select to_regclass('drizzle.__drizzle_migrations') as name",
      );
      const history = relation.rows[0].name
        ? await target.query("select count(*)::int as count from drizzle.__drizzle_migrations")
        : { rows: [{ count: 0 }] };
      const expectedHistory = testCase.name === "nonempty-history" ? 1 : 0;
      if (history.rows[0].count !== expectedHistory) {
        throw new Error(`Adoption mutated migration history for ${testCase.name}`);
      }
      console.log(`ADOPTION_REFUSAL_PASS:${testCase.name}`);
    } finally {
      await target.end().catch(() => undefined);
      await admin.query(`DROP DATABASE IF EXISTS ${database}`);
    }
  }
} finally {
  await admin.end();
}