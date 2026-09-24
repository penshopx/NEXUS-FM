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
const zodRoot = new URL("../api-zod/", packageRoot);
const zodDistUrl = new URL("dist/", zodRoot);
const zodDeclarationUrl = new URL("dist/authorization-scopes.d.ts", zodRoot);
const zodIndexUrl = new URL("dist/index.d.ts", zodRoot);
const zodBuildInfoUrl = new URL("tsconfig.tsbuildinfo", zodRoot);
const staleMarker = "__STALE_API_CLIENT_DECLARATION__";
const staleZodMarker = "__STALE_API_ZOD_DECLARATION__";
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "nexus-api-declarations-"),
);
const declarationBackup = join(temporaryDirectory, "index.d.ts");
const buildInfoBackup = join(temporaryDirectory, "tsconfig.tsbuildinfo");
const zodDeclarationBackup = join(temporaryDirectory, "authorization-scopes.d.ts");
const zodIndexBackup = join(temporaryDirectory, "zod-index.d.ts");
const zodBuildInfoBackup = join(temporaryDirectory, "zod-tsconfig.tsbuildinfo");

let hadDeclaration = false;
let hadBuildInfo = false;
let hadDist = false;
let hadZodDeclaration = false;
let hadZodIndex = false;
let hadZodBuildInfo = false;
let hadZodDist = false;

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

  try {
    await stat(zodDistUrl);
    hadZodDist = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  for (const [source, backup, markPresent] of [
    [zodDeclarationUrl, zodDeclarationBackup, () => { hadZodDeclaration = true; }],
    [zodIndexUrl, zodIndexBackup, () => { hadZodIndex = true; }],
    [zodBuildInfoUrl, zodBuildInfoBackup, () => { hadZodBuildInfo = true; }],
  ]) {
    try {
      await copyFile(source, backup);
      markPresent();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  await mkdir(distUrl, { recursive: true });
  await mkdir(zodDistUrl, { recursive: true });
  await writeFile(
    declarationUrl,
    `export declare const ${staleMarker}: unique symbol;\n`,
  );
  await writeFile(
    zodDeclarationUrl,
    `export declare const ${staleZodMarker}: unique symbol;\n`,
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

  const rebuiltZodDeclaration = await readFile(zodDeclarationUrl, "utf8");
  const rebuiltZodIndex = await readFile(zodIndexUrl, "utf8");
  if (rebuiltZodDeclaration.includes(staleZodMarker) ||
      !rebuiltZodDeclaration.includes("doesAuthorizationScopeBroaden") ||
      !rebuiltZodIndex.includes('export * from "./authorization-scopes"')) {
    throw new Error(
      "NEXUS-FM typecheck did not rebuild both API Zod authorization scope exports",
    );
  }

  console.log("NEXUS_TYPECHECK_SHARED_DECLARATION_REBUILD_PASS");
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

  if (!hadZodDist) {
    await rm(zodDistUrl, { recursive: true, force: true });
  } else {
    if (hadZodDeclaration) {
      await copyFile(zodDeclarationBackup, zodDeclarationUrl);
    } else {
      await rm(zodDeclarationUrl, { force: true });
    }
    if (hadZodIndex) {
      await copyFile(zodIndexBackup, zodIndexUrl);
    } else {
      await rm(zodIndexUrl, { force: true });
    }
  }

  if (hadZodBuildInfo) {
    await copyFile(zodBuildInfoBackup, zodBuildInfoUrl);
  } else {
    await rm(zodBuildInfoUrl, { force: true });
  }

  await rm(temporaryDirectory, { recursive: true, force: true });
}