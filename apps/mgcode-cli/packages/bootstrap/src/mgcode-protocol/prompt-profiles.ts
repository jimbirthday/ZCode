import {
  zcodeWorkspaceUpdatePromptProfilesParamsSchema,
  type PromptProfile,
} from "@zcode/shared";
import { parseParams, type ZCodeProtocolAgentServerContext } from "./server-types.js";

export interface PromptProfilePublication {
  profiles: PromptProfile[];
}

export function publishPromptProfiles(
  context: {
    promptProfilePublication?: PromptProfilePublication;
    sessions: {
      values(): Iterable<{
        app: { runtime: { setPromptProfiles(profiles: readonly PromptProfile[]): void } };
      }>;
    };
  },
  profiles: readonly PromptProfile[],
): { profileCount: number; updatedSessionCount: number } {
  const copy = profiles.map((profile) => ({ ...profile }));
  context.promptProfilePublication = { profiles: copy };
  let updatedSessionCount = 0;
  for (const record of context.sessions.values()) {
    record.app.runtime.setPromptProfiles(copy);
    updatedSessionCount += 1;
  }
  return { profileCount: copy.length, updatedSessionCount };
}

export async function updatePromptProfiles(
  context: ZCodeProtocolAgentServerContext,
  rawParams: unknown,
) {
  const params = parseParams(zcodeWorkspaceUpdatePromptProfilesParamsSchema, rawParams);
  return publishPromptProfiles(context, params.profiles);
}
