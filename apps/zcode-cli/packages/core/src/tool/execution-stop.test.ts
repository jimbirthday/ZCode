import assert from "node:assert/strict";
import test from "node:test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  formatBashModelContent,
  formatPersistedBashModelContent,
} from "./handlers/bash-model-content.js";
import { decideBashSandbox } from "./bash-sandbox-policy.js";
import { editToolForFamily, filterDefaultModelTools } from "./edit-dialect.js";
import { modelMessageOmitsLargeBody, summarizeLargeToolResult } from "./large-tool-output.js";
import { formatGenericPersistedOutputContent } from "./result-persistence-format.js";
import { buildVisibleGoalStop } from "../runtime/goal-stop.js";
import { decideSubagentBudgetStop } from "../runtime/subagent-budget.js";
import { DefaultRuntimeConfig } from "../../../contracts/src/config/index.ts";
import { appSettingsSchema } from "../../../../../../packages/shared/src/validationAppSettings.ts";
import { createContextBuilder } from "../context/builder.js";

test("each model family exposes one edit tool and drops Computer Use", () => {
  const tools = [
    { name: "Read" },
    { name: "Edit" },
    { name: "ApplyPatch" },
    { name: "ComputerUse" },
    { name: "browser" },
  ];
  const openai = filterDefaultModelTools(tools, { editTool: editToolForFamily("openai") });
  const claude = filterDefaultModelTools(tools, { editTool: editToolForFamily("claude") });
  assert.deepEqual(openai.map((tool) => tool.name), ["Read", "ApplyPatch"]);
  assert.deepEqual(claude.map((tool) => tool.name), ["Read", "Edit"]);
  const gated = filterDefaultModelTools(tools, {
    editTool: "Edit",
    browserPermissionGated: true,
  });
  assert.equal(gated.some((tool) => tool.name === "browser"), true);
  assert.equal(gated.some((tool) => tool.name === "ComputerUse"), false);
});

test("yolo denies cat ~/.SSH/id_rsa", () => {
  const decision = decideBashSandbox({
    command: "cat ~/.SSH/id_rsa",
    homeDir: "/Users/jim",
    mode: "yolo",
  });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason ?? "", /credential path denied/);
});

test("yolo does not allow a credential-directory read", () => {
  const home = homedir();
  for (const command of [
    `cat ${join(home, ".ssh", "id_rsa")}`,
    "cat ~/.ssh/id_rsa",
    "cat $HOME/.ssh/id_rsa",
    "cat ${HOME}/.aws/credentials",
    "cat ~/../.ssh/id_rsa",
    "cat .ssh/id_rsa",
    "cat ~/.SSH/id_rsa",
  ]) {
    const decision = decideBashSandbox({ command, homeDir: home, mode: "yolo" });
    assert.equal(decision.allowed, false, command);
    assert.match(decision.reason ?? "", /credential path denied/);
  }
  const folded = decideBashSandbox({
    command: "cat ~/.SSH/id_rsa",
    homeDir: "/Users/jim",
    mode: "yolo",
  });
  assert.equal(folded.allowed, false);
  assert.match(folded.reason ?? "", /credential path denied/);
});

test("large bash output is a summary plus path in the model message", () => {
  const body = "secret-line\n" + "x".repeat(4000);
  const message = formatPersistedBashModelContent({
    content: body,
    originalBytes: body.length,
    output: { stdout: body, stderr: "", exitCode: 0, interrupted: false },
    persistedPath: "/var/zcode/bash-output.txt",
  });
  assert.equal(typeof message, "string");
  assert.match(String(message), /Full output path: \/var\/zcode\/bash-output\.txt/);
  assert.equal(String(message).includes(body), false);
  assert.equal(String(message).includes("<persisted-output>"), false);
  const live = formatBashModelContent({
    stdout: body,
    stderr: "",
    exitCode: 0,
    interrupted: false,
    persistedOutputPath: "/var/zcode/bash-output.txt",
    persistedOutputSize: body.length,
  });
  assert.equal(String(live).includes(body), false);
  assert.match(String(live), /Full output path: \/var\/zcode\/bash-output\.txt/);
  assert.equal(String(live).includes("<persisted-output>"), false);
  assert.ok(String(live).length < 500);
});

test("large tool output becomes a summary plus path", () => {
  const body = "x".repeat(4000);
  const message = formatGenericPersistedOutputContent({
    content: body,
    originalBytes: body.length,
    persistedPath: "/tmp/tool-output.txt",
  });
  assert.match(message, /Full output path: \/tmp\/tool-output\.txt/);
  assert.equal(modelMessageOmitsLargeBody(message, body), true);
  assert.match(summarizeLargeToolResult({ content: body, path: "/tmp/tool-output.txt", originalBytes: 4000 }), /summary/);
});

test("skill listings and memory indexes stay out by default", () => {
  const built = createContextBuilder({
    workingDirectory: "/work/app",
    envInfo: {
      cwd: "/work/app",
      platform: "darwin",
      shell: "fish",
      osVersion: "test",
      git: { isRepository: false },
    },
    skills: { skills: [{ name: "review", description: "Review", location: "/skills/review" }], diagnostics: [], totalDiscovered: 1 } as never,
    memoryRoot: "/work/app/.memory",
    memoryIndexContent: "- [Fact](fact.md) — hook",
    guidanceToolNames: ["Skill"],
  }).build();
  const text = [...built.systemMessages, ...built.metaUserAttachments.map((item) => ({ role: "user", content: item.content }))]
    .map((item) => String(item.content))
    .join("\n");
  assert.equal(DefaultRuntimeConfig.features.memory, false);
  assert.equal(appSettingsSchema.parse({}).memoryEnabled, false);
  assert.equal(text.includes("/skills/review"), false);
  assert.equal(text.includes("fact.md"), false);
});

test("failed goal verification is a visible stop and a spent budget stops the child", () => {
  const stop = buildVisibleGoalStop({ reason: "tests failed" });
  assert.equal(stop.visible, true);
  assert.equal(stop.passed, false);
  assert.match(stop.message, /Goal verification failed: tests failed/);
  assert.equal(
    decideSubagentBudgetStop({ taskType: "subagent_child", modelStepCount: 2, maxTurns: 2 }).stop,
    true,
  );
  assert.equal(
    decideSubagentBudgetStop({ taskType: "main", modelStepCount: 9, maxTurns: 2 }).stop,
    false,
  );
});
