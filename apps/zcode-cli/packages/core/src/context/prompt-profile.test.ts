import assert from "node:assert/strict";
import test from "node:test";
import { createContextBuilder } from "./builder.js";
import {
  HARDCODED_COMMUNICATION_HEADING,
  HARDCODED_ZCODE_IDENTITY,
  parsePromptProfileCatalog,
  resolveModelPromptProfile,
} from "./prompt-profile.js";
import { createSubagentContextBuilder } from "../subagent/context-builder.js";

const profiles = parsePromptProfileCatalog([
  {
    id: "default",
    body: "You are a careful coding partner.",
    language: "en",
  },
  {
    id: "claude-opus",
    providerId: "anthropic",
    modelId: "claude-opus",
    body: "You are a terse reviewer.",
    language: "zh-CN",
  },
  {
    id: "openai-family",
    family: "openai",
    body: "You are a patch-first editor.",
    language: "en",
  },
]);

const envInfo = {
  cwd: "/work/app",
  platform: "darwin",
  shell: "fish",
  osVersion: "test",
  git: { isRepository: false },
} as const;

function systemText(messages: { role: string; content: unknown }[]): string {
  return messages
    .filter((message) => message.role === "system")
    .map((message) => String(message.content))
    .join("\n");
}

test("exact model match beats provider, family, and default", () => {
  const exact = resolveModelPromptProfile(profiles, {
    providerId: "anthropic",
    modelId: "claude-opus",
  });
  const provider = resolveModelPromptProfile(
    [
      { id: "provider", providerId: "anthropic", body: "provider", language: "en" },
      ...profiles,
    ],
    { providerId: "anthropic", modelId: "claude-sonnet" },
  );
  assert.equal(exact?.id, "claude-opus");
  assert.equal(provider?.id, "provider");
  assert.equal(
    resolveModelPromptProfile(profiles, { providerId: "openai", modelId: "gpt-5" })?.id,
    "openai-family",
  );
  assert.equal(
    resolveModelPromptProfile(profiles, { providerId: "other", modelId: "m" })?.id,
    "default",
  );
});

test("two models get different system segments without hardcoded ZCode prose", () => {
  const workspace = {
    filePath: "/work/app/AGENTS.md",
    fileName: "AGENTS.md",
    content: "Run pnpm test before you finish.",
    bytesRead: 10,
    sizeBytes: 10,
    truncated: false,
  };
  const claude = createContextBuilder({
    workingDirectory: "/work/app",
    envInfo,
    promptProfiles: profiles,
    modelQuery: { providerId: "anthropic", modelId: "claude-opus" },
    userInstructions: workspace,
    presentationSurface: "zcode_desktop",
    currentDate: "2026-09-22",
    guidanceToolNames: ["Read", "Edit"],
  }).build();
  const openai = createContextBuilder({
    workingDirectory: "/work/app",
    envInfo,
    promptProfiles: profiles,
    modelQuery: { providerId: "openai", modelId: "gpt-5" },
    userInstructions: workspace,
    currentDate: "2026-09-22",
    guidanceToolNames: ["Read", "ApplyPatch"],
  }).build();
  const claudeSystem = systemText(claude.systemMessages);
  const openaiSystem = systemText(openai.systemMessages);
  assert.notEqual(claudeSystem, openaiSystem);
  assert.match(claudeSystem, /Reply language: zh-CN/);
  assert.match(openaiSystem, /Reply language: en/);
  for (const text of [claudeSystem, openaiSystem]) {
    assert.equal(text.includes(HARDCODED_ZCODE_IDENTITY), false);
    assert.equal(text.includes(HARDCODED_COMMUNICATION_HEADING), false);
    assert.equal(text.includes("OVERRIDE any default behavior"), false);
  }
  const constraint = claude.metaUserAttachments.map((item) => item.content).join("\n");
  assert.match(constraint, /do not replace the model system prompt/i);
  assert.match(constraint, /Run pnpm test/);
});

test("subagent and workflow actor share the profile and only add a role", () => {
  const query = { providerId: "anthropic", modelId: "claude-opus" };
  const free = createContextBuilder({
    workingDirectory: "/work/app",
    envInfo,
    promptProfiles: profiles,
    modelQuery: query,
    guidanceToolNames: ["Read"],
  }).build();
  const workflow = createContextBuilder({
    workingDirectory: "/work/app",
    envInfo,
    promptProfiles: profiles,
    modelQuery: query,
    guidanceToolNames: ["Read"],
    workflowActor: { name: "reviewer", persona: "Check the diff." },
  }).build();
  const subagent = createSubagentContextBuilder({
    agentPrompt: "Check the diff.",
    envInfo,
    model: { providerId: "anthropic", modelId: "claude-opus", id: "anthropic/claude-opus" } as never,
    promptProfiles: profiles,
  }).build();
  const freeText = systemText(free.systemMessages);
  const workflowText = systemText(workflow.systemMessages);
  const subagentText = systemText(subagent.systemMessages);
  assert.match(workflowText, /Role: Check the diff\./);
  assert.match(subagentText, /Role: Check the diff\./);
  assert.equal(freeText.includes("Role:"), false);
  assert.match(workflowText, /You are a terse reviewer\./);
  assert.match(subagentText, /You are a terse reviewer\./);
  assert.equal(workflowText.includes(HARDCODED_ZCODE_IDENTITY), false);
  assert.equal(subagentText.includes(HARDCODED_ZCODE_IDENTITY), false);
});
