import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  promptProfileCatalogSchema,
  type PromptProfile,
} from "@zcode/shared";
import { atomicWriteText } from "../fs/atomicFileUtils.js";

export class PromptProfileConfigError extends Error {
  constructor(readonly code: "invalid-json" | "invalid-catalog") {
    super(code);
    this.name = "PromptProfileConfigError";
  }
}

export function resolveUserPromptProfileConfigPath(homeDir = homedir()): string {
  return join(homeDir, ".zcode", "cli", "config.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readUserPromptProfiles(configPath: string): Promise<PromptProfile[]> {
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new PromptProfileConfigError("invalid-json");
  }
  if (!isRecord(parsed) || parsed.promptProfiles === undefined) return [];
  const catalog = promptProfileCatalogSchema.safeParse(parsed.promptProfiles);
  if (!catalog.success) throw new PromptProfileConfigError("invalid-catalog");
  return catalog.data;
}

export async function writeUserPromptProfiles(
  configPath: string,
  profiles: readonly PromptProfile[],
): Promise<void> {
  const catalog = promptProfileCatalogSchema.safeParse(profiles);
  if (!catalog.success) throw new PromptProfileConfigError("invalid-catalog");
  let current: Record<string, unknown> = {};
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) throw new PromptProfileConfigError("invalid-json");
    current = parsed;
  } catch (error) {
    if (error instanceof PromptProfileConfigError) throw error;
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      if (error instanceof SyntaxError) throw new PromptProfileConfigError("invalid-json");
      throw error;
    }
  }
  current.promptProfiles = catalog.data;
  await atomicWriteText(configPath, `${JSON.stringify(current, null, 2)}\n`);
}
