import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const workspaceRoot = new URL("../../../", import.meta.url);
const packageRoot = new URL("../", import.meta.url);
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "workspace-typecheck-declarations-"),
);
const invocationLog = join(temporaryDirectory, "api-client-builds.log");
const observer = join(temporaryDirectory, "observe-typescript-build.cjs");

try {
  await writeFile(
    observer,
    `const { appendFileSync } = require("node:fs");

const isTypeScriptBuild =
  process.argv[1]?.replaceAll("\\\\", "/").endsWith("/typescript/bin/tsc") &&
  process.argv.includes("--build") &&
  process.argv.includes("--force");
const declarationBuildDirectories = new Set([
  ${JSON.stringify(new URL(".", workspaceRoot).pathname.slice(0, -1))},
  ${JSON.stringify(packageRoot.pathname.slice(0, -1))},
]);

if (isTypeScriptBuild && declarationBuildDirectories.has(process.cwd())) {
  appendFileSync(
    process.env.API_CLIENT_DECLARATION_BUILD_LOG,
    process.cwd() + "\\n",
  );
}
`,
  );

  await execFileAsync("pnpm", ["run", "typecheck"], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      API_CLIENT_DECLARATION_BUILD_LOG: invocationLog,
      NODE_OPTIONS:
        `--require=${observer} ${process.env.NODE_OPTIONS ?? ""}`.trim(),
    },
    maxBuffer: 10 * 1024 * 1024,
  });

  const invocations = (await readFile(invocationLog, "utf8"))
    .split("\n")
    .filter(Boolean);

  if (invocations.length !== 1) {
    throw new Error(
      `Canonical workspace typecheck built API client declarations ${invocations.length} times; expected exactly once.\n${invocations.join("\n")}`,
    );
  }

  console.log("WORKSPACE_TYPECHECK_SINGLE_DECLARATION_BUILD_PASS");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}