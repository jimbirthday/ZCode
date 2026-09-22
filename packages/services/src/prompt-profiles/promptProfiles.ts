import type { PromptProfile } from "@zcode/shared";
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

export interface PromptProfileSaveResult {
  profiles: PromptProfile[];
  appliedToRunningAgents: boolean;
  runningAgentCount: number;
  applyError?: string;
}

export interface IPromptProfileService {
  listPromptProfiles(): Promise<PromptProfile[]>;
  savePromptProfiles(params: {
    profiles: PromptProfile[];
    workspacePath?: string;
    workspaceIdentity?: string;
  }): Promise<PromptProfileSaveResult>;
}

export const IPromptProfileService = createServiceDescriptor<IPromptProfileService>(
  ServiceChannels.PromptProfiles,
);
