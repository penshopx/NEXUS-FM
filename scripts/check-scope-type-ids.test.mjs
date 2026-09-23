import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { databaseScopeIds, openApiScopeIds, assertScopeIdsMatch } from "./check-scope-type-ids.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [database, spec] = await Promise.all([
  readFile(path.join(root, "lib/db/src/schema/authorization.ts"), "utf8"),
  readFile(path.join(root, "lib/api-spec/openapi.yaml"), "utf8"),
]);

test("current database and OpenAPI scope IDs match in order", () => {
  assert.doesNotThrow(() => assertScopeIdsMatch(databaseScopeIds(database), openApiScopeIds(spec)));
});

test("a database-only scope reports the missing API ID", () => {
  const changed = database.replace('"OWNED_REQUEST",', '"OWNED_REQUEST",\n  "NEW_SCOPE",');
  assert.match(changed, /NEW_SCOPE/);
  assert.throws(
    () => assertScopeIdsMatch(databaseScopeIds(changed), openApiScopeIds(spec)),
    /Database only: NEW_SCOPE\n  OpenAPI only: \(none\)/,
  );
});

test("an API-only scope reports the missing database ID", () => {
  const changed = spec.replace("VENDOR_ASSIGNMENT, OWNED_REQUEST]", "VENDOR_ASSIGNMENT, OWNED_REQUEST, NEW_SCOPE]");
  assert.throws(
    () => assertScopeIdsMatch(databaseScopeIds(database), openApiScopeIds(changed)),
    /Database only: \(none\)\n  OpenAPI only: NEW_SCOPE/,
  );
});

test("reordered IDs fail with an ordering error", () => {
  const ids = openApiScopeIds(spec);
  assert.throws(
    () => assertScopeIdsMatch(databaseScopeIds(database), [ids[1], ids[0], ...ids.slice(2)]),
    /ScopeType ordering mismatch/,
  );
});

test("unrecognized source shapes fail instead of silently skipping validation", () => {
  assert.throws(() => openApiScopeIds(spec.replace("    ScopeType:", "    OtherType:")), /Cannot find OpenAPI/);
  assert.throws(() => databaseScopeIds(database.replace('pgEnum("scope_type", scopeTypeValues)', 'pgEnum("scope_type", [])')), /Cannot find scopeTypeValues wired/);
});