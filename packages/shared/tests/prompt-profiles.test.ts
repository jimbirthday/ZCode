import assert from "node:assert/strict";
import test from "node:test";
import {
  promptProfileFromDraft,
  promptProfileMatchKey,
  upsertPromptProfile,
  validatePromptProfileCatalog,
} from "../src/prompt-profiles.ts";

test("draft becomes a matchable profile and rejects a duplicate scope", () => {
  const created = promptProfileFromDraft({
    scope: "model",
    family: "grok",
    providerId: "mgoole",
    modelId: "grok-4.7",
    language: "zh-CN",
    body: "先读文件再改。",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(promptProfileMatchKey(created.profile), "model:mgoole/grok-4.7");
  const catalog = upsertPromptProfile(
    [{ id: "default", body: "默认", language: "zh-CN" }],
    created.profile,
  );
  assert.equal(validatePromptProfileCatalog(catalog), null);
  assert.equal(validatePromptProfileCatalog([...catalog, created.profile]), "duplicate-match");
});
