import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./test-authorization-migrations.mjs", import.meta.url));
const fixturePrefix = path.join(tmpdir(), "nexus-migration-regression-");

function runRegression(args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: path.dirname(script),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, output }));
  });
}

async function assertCleanedUp(result) {
  const roots = [...result.output.matchAll(/^MIGRATION_FIXTURE_ROOT:(.+)$/gm)];
  assert.equal(roots.length, 1, `Expected one fixture root in runner output:\n${result.output}`);
  const root = roots[0][1].trim();
  assert.ok(root.startsWith(fixturePrefix), `Unexpected fixture root: ${root}`);
  await assert.rejects(access(root), { code: "ENOENT" }, `Fixture root remains: ${root}`);
  return root;
}

// Start both runs before awaiting either one; a shared fixture path will race.
const [first, second] = await Promise.all([runRegression(), runRegression()]);
const firstRoot = await assertCleanedUp(first);
const secondRoot = await assertCleanedUp(second);
assert.notEqual(firstRoot, secondRoot, "Concurrent runs used the same fixture root");
assert.equal(first.code, 0, `First migration regression failed:\n${first.output}`);
assert.equal(second.code, 0, `Second migration regression failed:\n${second.output}`);
assert.match(first.output, /REGRESSION: PASS/, "First migration regression did not finish");
assert.match(second.output, /REGRESSION: PASS/, "Second migration regression did not finish");

const failure = await runRegression(["--force-fixture-failure"]);
await assertCleanedUp(failure);
assert.notEqual(failure.code, 0, "Forced fixture failure unexpectedly succeeded");
assert.match(failure.output, /Forced migration fixture failure after setup/);
console.log("MIGRATION_FIXTURE_ISOLATION: PASS");