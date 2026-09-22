import { z } from "zod";

export const PROMPT_PROFILE_FAMILIES = ["openai", "claude", "grok", "default"] as const;

export type PromptProfileFamily = (typeof PROMPT_PROFILE_FAMILIES)[number];

export const promptProfileSchema = z
  .object({
    id: z.string().min(1),
    providerId: z.string().min(1).optional(),
    modelId: z.string().min(1).optional(),
    family: z.string().min(1).optional(),
    body: z.string().min(1),
    language: z.string().min(1),
  })
  .strict();

export type PromptProfile = z.infer<typeof promptProfileSchema>;

export const promptProfileCatalogSchema = z.array(promptProfileSchema);

export type PromptProfileScope = "default" | "family" | "provider" | "model";

export interface PromptProfileDraft {
  scope: PromptProfileScope;
  family: string;
  providerId: string;
  modelId: string;
  language: string;
  body: string;
}

export type PromptProfileDraftError =
  | "body"
  | "language"
  | "family"
  | "provider"
  | "model"
  | "duplicate-match"
  | "invalid";

export function promptProfileMatchKey(
  profile: Pick<PromptProfile, "id" | "providerId" | "modelId" | "family">,
): string {
  const providerId = profile.providerId?.trim() ?? "";
  const modelId = profile.modelId?.trim() ?? "";
  const family = profile.family?.trim() ?? "";
  if (providerId && modelId) return `model:${providerId}/${modelId}`;
  if (providerId) return `provider:${providerId}`;
  if (family) return `family:${family}`;
  if (profile.id === "default") return "default";
  return `id:${profile.id}`;
}

export function inferPromptProfileScope(profile: PromptProfile): PromptProfileScope {
  if (profile.providerId?.trim() && profile.modelId?.trim()) return "model";
  if (profile.providerId?.trim()) return "provider";
  if (profile.family?.trim()) return "family";
  return "default";
}

export function draftFromPromptProfile(profile: PromptProfile): PromptProfileDraft {
  const scope = inferPromptProfileScope(profile);
  const unscoped =
    scope === "default" && profile.id !== "default" && !profile.providerId && !profile.family;
  return {
    scope: unscoped ? "family" : scope,
    family: profile.family?.trim() || "grok",
    providerId: profile.providerId?.trim() ?? "",
    modelId: profile.modelId?.trim() ?? "",
    language: profile.language,
    body: profile.body,
  };
}

export function emptyPromptProfileDraft(language: string): PromptProfileDraft {
  return {
    scope: "default",
    family: "grok",
    providerId: "",
    modelId: "",
    language,
    body: "",
  };
}

export function promptProfileFromDraft(
  draft: PromptProfileDraft,
): { ok: true; profile: PromptProfile } | { ok: false; error: PromptProfileDraftError } {
  const language = draft.language.trim();
  if (!draft.body.trim()) return { ok: false, error: "body" };
  if (!language) return { ok: false, error: "language" };
  if (draft.scope === "default") {
    return { ok: true, profile: { id: "default", body: draft.body, language } };
  }
  if (draft.scope === "family") {
    const family = draft.family.trim();
    if (!family) return { ok: false, error: "family" };
    return { ok: true, profile: { id: `family:${family}`, family, body: draft.body, language } };
  }
  const providerId = draft.providerId.trim();
  if (!providerId) return { ok: false, error: "provider" };
  if (draft.scope === "provider") {
    return {
      ok: true,
      profile: { id: `provider:${providerId}`, providerId, body: draft.body, language },
    };
  }
  const modelId = draft.modelId.trim();
  if (!modelId) return { ok: false, error: "model" };
  return {
    ok: true,
    profile: {
      id: `model:${providerId}/${modelId}`,
      providerId,
      modelId,
      body: draft.body,
      language,
    },
  };
}

export function validatePromptProfileCatalog(
  profiles: readonly PromptProfile[],
): PromptProfileDraftError | null {
  const parsed = promptProfileCatalogSchema.safeParse(profiles);
  if (!parsed.success) return "invalid";
  const keys = new Set<string>();
  for (const profile of parsed.data) {
    const key = promptProfileMatchKey(profile);
    if (keys.has(key)) return "duplicate-match";
    keys.add(key);
  }
  return null;
}

export function upsertPromptProfile(
  profiles: readonly PromptProfile[],
  profile: PromptProfile,
  replaceMatchKey?: string,
): PromptProfile[] {
  const nextKey = promptProfileMatchKey(profile);
  const withoutReplaced = profiles.filter((entry) => {
    const key = promptProfileMatchKey(entry);
    return key !== nextKey && key !== replaceMatchKey;
  });
  return [...withoutReplaced, profile];
}
