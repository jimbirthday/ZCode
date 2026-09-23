import { join } from "node:path";
import { PRODUCT_DATA_DIR_NAME } from "./product-data-dir.js";

/** Shared by desktop and CLI. One directory, one session database. */
export const SHARED_SESSION_DIRECTORY_SEGMENTS = [PRODUCT_DATA_DIR_NAME, "sessions"] as const;
export const SHARED_SESSION_DB_FILE = "db.sqlite";

export const AGENT_BINARY_ENV = "ZCODE_AGENT_BINARY";
export const AGENT_RESOURCE_DIR = "agent";

/** Disabled loopback. The default product does not call vendor hosts. */
export const DISABLED_PRODUCT_ORIGIN = "http://127.0.0.1:9";

const VENDOR_HOST = /(?:^|\.)(?:z\.ai|bigmodel\.cn)$/i;

export function resolveSharedSessionDirectory(homeDir: string): string {
  return join(homeDir, ...SHARED_SESSION_DIRECTORY_SEGMENTS);
}

export function resolveSharedSessionDbPath(homeDir: string): string {
  return join(resolveSharedSessionDirectory(homeDir), SHARED_SESSION_DB_FILE);
}

export function resolveDefaultProductEndpoints(): {
  origin: string;
  businessBaseUrl: string;
  bigModelOrigin: string;
  oauthOrigin: string;
} {
  return {
    origin: DISABLED_PRODUCT_ORIGIN,
    businessBaseUrl: DISABLED_PRODUCT_ORIGIN,
    bigModelOrigin: DISABLED_PRODUCT_ORIGIN,
    oauthOrigin: DISABLED_PRODUCT_ORIGIN,
  };
}

export function isVendorProductHost(hostname: string): boolean {
  return VENDOR_HOST.test(hostname.trim());
}

export function neutralizeVendorEndpointText(value: string): string {
  return value.replace(/https?:\/\/[^/"'\s]*(?:z\.ai|bigmodel\.cn)[^"'\s]*/gi, DISABLED_PRODUCT_ORIGIN);
}

export function agentLookupUsesBundledRuntime(): {
  binaryEnvVar: string;
  bundledResourceDir: string;
} {
  return {
    binaryEnvVar: AGENT_BINARY_ENV,
    bundledResourceDir: AGENT_RESOURCE_DIR,
  };
}

/** Launcher must exec the bundled runtime, never a system `node` on PATH. */
export function bundledLauncherScript(installDirToken = "$ROOT"): string {
  return `#!/bin/sh
set -eu
ROOT="${installDirToken}"
if [ -x "$ROOT/runtime/node" ]; then
  exec "$ROOT/runtime/node" "$ROOT/agent/zcode.cjs" "$@"
fi
if [ -x "$ROOT/runtime/node.exe" ]; then
  exec "$ROOT/runtime/node.exe" "$ROOT/agent/zcode.cjs" "$@"
fi
if [ -x "$ROOT/runtime/bin/node" ]; then
  exec "$ROOT/runtime/bin/node" "$ROOT/agent/zcode.cjs" "$@"
fi
if [ -x "$ROOT/runtime/bin/node.exe" ]; then
  exec "$ROOT/runtime/bin/node.exe" "$ROOT/agent/zcode.cjs" "$@"
fi
echo "zcode bundled runtime is missing" >&2
exit 127
`;
}

export function launcherRequiresSystemNode(script: string): boolean {
  return /(^|\n)\s*exec\s+node\b/.test(script) || /\bcommand -v node\b/.test(script);
}
