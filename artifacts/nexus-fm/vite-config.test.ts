import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const projectRoot = import.meta.dirname;
const viteBin = path.join(projectRoot, "node_modules/vite/bin/vite.js");
const temporaryDirectories: string[] = [];

function environmentWithoutServerSettings(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const { BASE_PATH: _basePath, PORT: _port, ...environment } = process.env;

  return {
    ...environment,
    ...overrides,
  };
}

function buildApplication(environment: NodeJS.ProcessEnv) {
  const outputDirectory = mkdtempSync(
    path.join(tmpdir(), "nexus-fm-vite-config-"),
  );
  temporaryDirectories.push(outputDirectory);

  execFileSync(
    process.execPath,
    [
      viteBin,
      "build",
      "--config",
      "vite.config.ts",
      "--outDir",
      outputDirectory,
      "--emptyOutDir",
    ],
    {
      cwd: projectRoot,
      env: environment,
      encoding: "utf8",
      stdio: "pipe",
    },
  );

  return readFileSync(path.join(outputDirectory, "index.html"), "utf8");
}

function loadServerConfig(environment: NodeJS.ProcessEnv) {
  return spawnSync(
    process.execPath,
    [viteBin, "--config", "vite.config.ts", "--clearScreen", "false"],
    {
      cwd: projectRoot,
      env: environment,
      encoding: "utf8",
      timeout: 10_000,
    },
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Vite release and server configuration", () => {
  it("builds a release without PORT or BASE_PATH", () => {
    const html = buildApplication(environmentWithoutServerSettings());

    expect(html).toMatch(/(?:src|href)="\/assets\/[^"]+"/);
  }, 60_000);

  it("preserves BASE_PATH in generated asset URLs", () => {
    const html = buildApplication(
      environmentWithoutServerSettings({
        BASE_PATH: "/release-check/",
      }),
    );

    expect(html).toMatch(/(?:src|href)="\/release-check\/assets\/[^"]+"/);
  }, 60_000);

  it.each([
    {
      name: "missing",
      environment: environmentWithoutServerSettings(),
      message: "PORT environment variable is required but was not provided.",
    },
    {
      name: "invalid",
      environment: environmentWithoutServerSettings({ PORT: "not-a-port" }),
      message: 'Invalid PORT value: "not-a-port"',
    },
  ])(
    "rejects a $name managed PORT for server startup",
    ({ environment, message }) => {
      const result = loadServerConfig(environment);

      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(message);
    },
  );
});
