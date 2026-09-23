import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_ZAI_BUSINESS_BASE_URL, DEFAULT_ZCODE_ENDPOINT_ORIGIN } from "../src/mgcodeEndpoint.js";
import { ZCODE_AGENT_RUNTIME } from "../src/mgcode-agent-runtime.js";
import {
  agentLookupUsesBundledRuntime,
  bundledLauncherScript,
  isVendorProductHost,
  launcherRequiresSystemNode,
  resolveDefaultProductEndpoints,
  resolveSharedSessionDbPath,
} from "../src/product-runtime-identity.js";
import { getDefaultSessionDbPath } from "../../../apps/mgcode-cli/zcode-cli/packages/adapters/src/storage/session-store/paths.js";
import { resolveSharedSessionDbPath as desktopSessionDbPath } from "../../desktop/src/shared/sessionDirectory.js";

test("default endpoints and agent lookup do not target vendor hosts or glm", () => {
  const endpoints = resolveDefaultProductEndpoints();
  const lookup = agentLookupUsesBundledRuntime();
  const values = [
    endpoints.origin,
    endpoints.businessBaseUrl,
    endpoints.bigModelOrigin,
    DEFAULT_ZCODE_ENDPOINT_ORIGIN,
    DEFAULT_ZAI_BUSINESS_BASE_URL,
    lookup.binaryEnvVar,
    lookup.bundledResourceDir,
    ZCODE_AGENT_RUNTIME.binaryEnvVar,
    ZCODE_AGENT_RUNTIME.bundledResourceDir,
  ];
  for (const value of values) {
    assert.equal(/z\.ai|bigmodel|GLM_BINARY_PATH|resources\/glm/i.test(value), false, value);
  }
  assert.equal(isVendorProductHost("api.z.ai"), true);
  assert.equal(isVendorProductHost("127.0.0.1"), false);
});

test("desktop and CLI session databases resolve to one directory", () => {
  const shared = resolveSharedSessionDbPath(homedir());
  assert.equal(getDefaultSessionDbPath(), shared);
  assert.equal(desktopSessionDbPath(homedir()), shared);
  assert.match(shared, /\.mgcode\/sessions\/db\.sqlite$/);
});

test("desktop packs the agent resource the lookup reads, and the CLI package installs runtime/node", async () => {
  const builder = readFileSync(
    new URL("../../desktop/electron-builder.config.js", import.meta.url),
    "utf8",
  );
  assert.match(builder, /to: "agent"/);
  assert.doesNotMatch(builder, /to: "glm"/);
  const { installBundledNodeRuntime } = await import("../../../scripts/mgcode-distribution/bundled-node.mjs");
  const packageRoot = mkdtempSync(`${tmpdir()}/zcode-runtime-`);
  const fakeNode = `${packageRoot}/fake-node`;
  writeFileSync(fakeNode, "#!/bin/sh\necho node\n");
  const installed = await installBundledNodeRuntime(packageRoot, fakeNode);
  assert.match(installed, /\/runtime\/node$/);
  assert.equal(readFileSync(installed, "utf8").includes("echo node"), true);
  const buildSource = readFileSync(
    new URL("../../../scripts/build-mgcode.mjs", import.meta.url),
    "utf8",
  );
  assert.match(buildSource, /await installBundledNodeRuntime\(packageRoot\)/);
});

test("shipped launcher executes the bundled runtime", async () => {
  const script = bundledLauncherScript("$ROOT");
  const installer = readFileSync(
    new URL("../../../scripts/mgcode-distribution/installer.mjs", import.meta.url),
    "utf8",
  );
  assert.equal(launcherRequiresSystemNode(script), false);
  assert.equal(launcherRequiresSystemNode(installer), false);
  assert.match(script, /runtime\/node/);
  assert.match(script, /runtime\/node\.exe/);
  assert.match(installer, /runtime\/node/);
  assert.match(installer, /runtime\/node\.exe/);
  assert.doesNotMatch(installer, /exec node /);
  assert.doesNotMatch(script, /exec node /);

  const packageRoot = mkdtempSync(`${tmpdir()}/zcode-launch-`);
  const fakeNode = join(packageRoot, "fake-node");
  writeFileSync(fakeNode, "#!/bin/sh\necho bundled-runtime\nexit 0\n");
  chmodSync(fakeNode, 0o755);
  const { installBundledNodeRuntime } = await import("../../../scripts/mgcode-distribution/bundled-node.mjs");
  await installBundledNodeRuntime(packageRoot, fakeNode);
  mkdirSync(join(packageRoot, "agent"), { recursive: true });
  writeFileSync(join(packageRoot, "agent", "zcode.cjs"), "#!/bin/sh\nexit 0\n");
  const launcher = join(packageRoot, "zcode");
  writeFileSync(launcher, bundledLauncherScript(packageRoot));
  chmodSync(launcher, 0o755);
  const ran = spawnSync(launcher, ["--help"], { encoding: "utf8" });
  assert.equal(ran.status, 0, ran.stderr);
  assert.match(ran.stdout, /bundled-runtime/);
});
