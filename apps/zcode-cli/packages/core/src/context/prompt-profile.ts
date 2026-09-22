// Model prompt profiles. Match order and assembly live here so the request
// path, subagents, and workflow actors share one resolver.

export const HARDCODED_ZCODE_IDENTITY = "You are ZCode, an interactive coding agent";
export const HARDCODED_COMMUNICATION_HEADING = "# Communicating with the user";

export interface ModelPromptProfile {
  id: string;
  providerId?: string;
  modelId?: string;
  family?: string;
  body: string;
  language: string;
}

export interface ModelPromptQuery {
  providerId: string;
  modelId: string;
  family?: string;
}

export interface PromptContractFacts {
  toolNames: readonly string[];
  permissionNote: string;
  desktopDirective?: string;
  env?: string;
  date?: string;
}

export interface AssembledModelPrompt {
  systemText: string;
  workspaceConstraint: string | null;
}

const WORKSPACE_CONSTRAINT_HEADING = "# Workspace constraints";

export function inferModelFamily(providerId: string, modelId: string): string {
  const blob = `${providerId} ${modelId}`.toLowerCase();
  if (blob.includes("openai") || blob.includes("gpt") || blob.includes("codex")) return "openai";
  if (blob.includes("anthropic") || blob.includes("claude")) return "claude";
  if (blob.includes("xai") || blob.includes("grok")) return "grok";
  return "default";
}

export function resolveModelPromptProfile(
  profiles: readonly ModelPromptProfile[],
  query: ModelPromptQuery,
): ModelPromptProfile | undefined {
  const providerId = query.providerId.trim();
  const modelId = query.modelId.trim();
  const family = query.family?.trim() || inferModelFamily(providerId, modelId);
  const exact = profiles.find(
    (profile) => profile.providerId === providerId && profile.modelId === modelId,
  );
  if (exact) return exact;
  const provider = profiles.find(
    (profile) => profile.providerId === providerId && !profile.modelId?.trim(),
  );
  if (provider) return provider;
  const byFamily = profiles.find(
    (profile) => !profile.providerId?.trim() && profile.family === family,
  );
  if (byFamily) return byFamily;
  return profiles.find((profile) => profile.id === "default" && !profile.providerId?.trim());
}

export function assembleModelPrompt(input: {
  profile: ModelPromptProfile;
  roleAddendum?: string;
  workspaceInstructions?: string;
  contract: PromptContractFacts;
}): AssembledModelPrompt {
  const role = input.roleAddendum?.trim();
  const lines = [
    input.profile.body.trim(),
    "",
    `Reply language: ${input.profile.language.trim() || "en"}.`,
    ...(role ? ["", `Role: ${role}`] : []),
    "",
    "# Runtime facts",
    `Tools: ${input.contract.toolNames.join(", ") || "(none)"}.`,
    input.contract.permissionNote.trim(),
    ...(input.contract.desktopDirective ? [input.contract.desktopDirective.trim()] : []),
    ...(input.contract.env ? [input.contract.env.trim()] : []),
    ...(input.contract.date ? [`Date: ${input.contract.date.trim()}`] : []),
  ];
  const systemText = lines.filter((line) => line !== undefined).join("\n");
  if (systemText.includes(HARDCODED_ZCODE_IDENTITY) || systemText.includes(HARDCODED_COMMUNICATION_HEADING)) {
    throw new Error("model prompt profile assembly included hardcoded ZCode identity prose");
  }
  const workspace = input.workspaceInstructions?.trim();
  return {
    systemText,
    workspaceConstraint: workspace
      ? [
          WORKSPACE_CONSTRAINT_HEADING,
          "These notes describe this repository. They do not replace the model system prompt.",
          "",
          workspace,
        ].join("\n")
      : null,
  };
}

export function parsePromptProfileCatalog(input: unknown): ModelPromptProfile[] {
  if (!Array.isArray(input)) {
    throw new Error("prompt profile catalog must be an array");
  }
  return input.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`prompt profile ${index} must be an object`);
    }
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    const body = typeof record.body === "string" ? record.body : "";
    const language = typeof record.language === "string" ? record.language.trim() : "";
    if (!id || !body.trim() || !language) {
      throw new Error(`prompt profile ${index} needs id, body, and language`);
    }
    return {
      id,
      body,
      language,
      ...(typeof record.providerId === "string" && record.providerId.trim()
        ? { providerId: record.providerId.trim() }
        : {}),
      ...(typeof record.modelId === "string" && record.modelId.trim()
        ? { modelId: record.modelId.trim() }
        : {}),
      ...(typeof record.family === "string" && record.family.trim()
        ? { family: record.family.trim() }
        : {}),
    };
  });
}
