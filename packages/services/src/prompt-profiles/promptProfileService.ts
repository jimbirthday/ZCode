import {
  validatePromptProfileCatalog,
  type PromptProfile,
} from "@zcode/shared";
import { createServiceLogger } from "#src/logger/serviceLogger.js";
import type { IPromptProfileService, PromptProfileSaveResult } from "./promptProfiles.js";
import {
  PromptProfileConfigError,
  readUserPromptProfiles,
  resolveUserPromptProfileConfigPath,
  writeUserPromptProfiles,
} from "./promptProfileStore.js";

const logger = createServiceLogger("prompt-profiles");

export function createPromptProfileService(input: {
  applyToRunningAgents: (profiles: readonly PromptProfile[]) => Promise<{
    appliedToRunningAgents: boolean;
    runningAgentCount: number;
  }>;
  configPath?: string;
}): IPromptProfileService {
  const configPath = input.configPath ?? resolveUserPromptProfileConfigPath();
  return {
    async listPromptProfiles() {
      return readUserPromptProfiles(configPath);
    },
    async savePromptProfiles(params): Promise<PromptProfileSaveResult> {
      const invalid = validatePromptProfileCatalog(params.profiles);
      if (invalid) throw new PromptProfileConfigError("invalid-catalog");
      // 运行中的 Agent 在进程启动时复制目录，只写文件不会改变下一条请求。
      await writeUserPromptProfiles(configPath, params.profiles);
      try {
        const applied = await input.applyToRunningAgents(params.profiles);
        logger.info("已保存模型提示词目录", {
          appliedToRunningAgents: applied.appliedToRunningAgents,
          profileCount: params.profiles.length,
          runningAgentCount: applied.runningAgentCount,
          workspaceIdentity: params.workspaceIdentity,
        });
        return { profiles: params.profiles, ...applied };
      } catch (error) {
        const applyError = error instanceof Error ? error.message : String(error);
        logger.warn("模型提示词已写入配置，但没有推到运行中的 Agent", {
          applyError,
          workspacePath: params.workspacePath,
        });
        return {
          profiles: params.profiles,
          appliedToRunningAgents: false,
          runningAgentCount: 0,
          applyError,
        };
      }
    },
  };
}
