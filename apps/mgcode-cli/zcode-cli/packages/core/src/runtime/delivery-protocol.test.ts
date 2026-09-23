import assert from "node:assert/strict";
import test from "node:test";
import { createContextBuilder } from "../context/builder.js";
import { filterDefaultModelTools } from "../tool/edit-dialect.js";
import { selectNewSessionWriteProtocol } from "../../../../../../../packages/services/src/mgcode-agent/mgcodeV4HostCommand.ts";

const profiles = [
  {
    id: "claude-opus",
    providerId: "anthropic",
    modelId: "claude-opus",
    body: "You are a terse reviewer.",
    language: "zh-CN",
  },
];

const envInfo = {
  cwd: "/work/app",
  platform: "darwin",
  shell: "fish",
  osVersion: "test",
  git: { isRepository: false },
};

test("workflow delivery uses the same profile as a free session", () => {
  const query = { providerId: "anthropic", modelId: "claude-opus" };
  const free = createContextBuilder({
    workingDirectory: "/work/app",
    envInfo,
    promptProfiles: profiles,
    modelQuery: query,
    guidanceToolNames: ["Read", "Bash"],
  }).build();
  const delivery = createContextBuilder({
    workingDirectory: "/work/app",
    envInfo,
    promptProfiles: profiles,
    modelQuery: query,
    guidanceToolNames: ["Read", "Bash"],
    workflowActor: { persona: "Publish the report." },
  }).build();
  const freeText = free.systemMessages.map((message) => String(message.content)).join("\n");
  const deliveryText = delivery.systemMessages.map((message) => String(message.content)).join("\n");
  assert.match(freeText, /You are a terse reviewer\./);
  assert.match(deliveryText, /You are a terse reviewer\./);
  assert.match(deliveryText, /Role: Publish the report\./);
  assert.equal(freeText.includes("Role:"), false);
});

test("browser is present only when permission-gated", () => {
  const registered = [
    { name: "Read" },
    { name: "Edit" },
    { name: "ComputerUse" },
    { name: "browser" },
  ];
  const absent = filterDefaultModelTools(registered, { editTool: "Edit" });
  assert.equal(absent.some((tool) => tool.name === "browser"), false);
  assert.equal(absent.some((tool) => tool.name === "ComputerUse"), false);
  const gated = filterDefaultModelTools(registered, {
    editTool: "Edit",
    browserPermissionGated: true,
  });
  assert.equal(gated.some((tool) => tool.name === "browser"), true);
  assert.equal(gated.some((tool) => tool.name === "ComputerUse"), false);
});

test("new session writes are v4 and Computer Use is absent", () => {
  assert.equal(selectNewSessionWriteProtocol(), "v4");
  const registered = [
    { name: "Read" },
    { name: "Edit" },
    { name: "ComputerUse" },
    { name: "browser" },
  ];
  const tools = filterDefaultModelTools(registered, { editTool: "Edit" });
  assert.equal(tools.some((tool) => tool.name === "ComputerUse"), false);
  assert.equal(tools.some((tool) => tool.name === "browser"), false);
  const gated = filterDefaultModelTools(registered, {
    editTool: "Edit",
    browserPermissionGated: true,
  });
  assert.equal(gated.some((tool) => tool.name === "browser"), true);
  assert.equal(gated.some((tool) => tool.name === "ComputerUse"), false);
});
