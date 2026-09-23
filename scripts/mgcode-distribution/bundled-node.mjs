import { chmod, cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

/** Copy the Node binary that built this package into runtime/node so the launcher does not use PATH. */
export async function installBundledNodeRuntime(packageRoot, nodeBinary = process.execPath) {
  const runtimeDir = resolve(packageRoot, "runtime");
  await mkdir(runtimeDir, { recursive: true });
  const target = resolve(runtimeDir, process.platform === "win32" ? "node.exe" : "node");
  await cp(nodeBinary, target);
  await chmod(target, 0o755);
  return target;
}
