import { execFile } from "node:child_process";
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageRoot = new URL("../", import.meta.url);
const workspaceRoot = new URL("../../../", import.meta.url);
const distUrl = new URL("dist/", packageRoot);
const declarationUrl = new URL("dist/index.d.ts", packageRoot);
const buildInfoUrl = new URL("tsconfig.tsbuildinfo", packageRoot);
const staleMarker = "__STALE_API_CLIENT_DECLARATION__";
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "nexus-api-declarations-"),
);
const declarationBackup = join(temporaryDirectory, "index.d.ts");
const buildInfoBackup = join(temporaryDirectory, "tsconfig.tsbuildinfo");

let hadDeclaration = false;
let hadBuildInfo = false;
let hadDist = false;

try {
  try {
    await stat(distUrl);
    hadDist = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  try {
    await copyFile(declarationUrl, declarationBackup);
    hadDeclaration = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  try {
    await copyFile(buildInfoUrl, buildInfoBackup);
    hadBuildInfo = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  await mkdir(distUrl, { recursive: true });
  await writeFile(
    declarationUrl,
    `export declare const ${staleMarker}: unique symbol;\n`,
  );

  await execFileAsync(
    "pnpm",
    ["--filter", "@workspace/nexus-fm", "run", "typecheck"],
    { cwd: workspaceRoot },
  );

  const rebuiltDeclaration = await readFile(declarationUrl, "utf8");
  if (rebuiltDeclaration.includes(staleMarker)) {
    throw new Error(
      "NEXUS-FM typecheck reused the deliberately stale API declaration",
    );
  }
  if (!rebuiltDeclaration.includes('export * from "./generated/api"')) {
    throw new Error(
      "NEXUS-FM typecheck did not rebuild the API declaration from current source",
    );
  }

  console.log("NEXUS_TYPECHECK_DECLARATION_REBUILD_PASS");
} finally {
  if (!hadDist) {
    await rm(distUrl, { recursive: true, force: true });
  } else if (hadDeclaration) {
    await copyFile(declarationBackup, declarationUrl);
  } else {
    await rm(declarationUrl, { force: true });
  }

  if (hadBuildInfo) {
    await copyFile(buildInfoBackup, buildInfoUrl);
  } else {
    await rm(buildInfoUrl, { force: true });
  }

  await rm(temporaryDirectory, { recursive: true, force: true });
}