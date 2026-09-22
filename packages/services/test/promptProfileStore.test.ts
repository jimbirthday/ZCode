import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  readUserPromptProfiles,
  writeUserPromptProfiles,
} from "../src/prompt-profiles/promptProfileStore.ts";

test("prompt profile save replaces only the catalog field", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zcode-prompt-profile-store-"));
  const configPath = join(dir, "config.json");
  await writeFile(configPath, JSON.stringify({ mcp: { servers: {} }, hooks: { enabled: false } }));
  await writeUserPromptProfiles(configPath, [
    { id: "default", body: "按仓库风格改代码。", language: "zh-CN" },
  ]);
  const saved = JSON.parse(await readFile(configPath, "utf8")) as {
    hooks: { enabled: boolean };
    promptProfiles: Array<{ id: string }>;
  };
  assert.equal(saved.hooks.enabled, false);
  assert.equal(saved.promptProfiles[0]?.id, "default");
  const loaded = await readUserPromptProfiles(configPath);
  assert.equal(loaded[0]?.language, "zh-CN");
});
