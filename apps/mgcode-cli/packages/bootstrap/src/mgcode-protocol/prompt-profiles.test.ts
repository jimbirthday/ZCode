import assert from "node:assert/strict";
import test from "node:test";
import { publishPromptProfiles } from "./prompt-profiles.ts";

test("publishing a catalog updates later sessions and live runtimes", () => {
  const seen: string[][] = [];
  const context = {
    sessions: new Map([
      [
        "session-1",
        {
          app: {
            runtime: {
              setPromptProfiles(profiles: readonly { id: string }[]) {
                seen.push(profiles.map((profile) => profile.id));
              },
            },
          },
        },
      ],
    ]),
  };
  const result = publishPromptProfiles(context, [
    { id: "default", body: "先读再改。", language: "zh-CN" },
  ]);
  assert.equal(result.updatedSessionCount, 1);
  assert.deepEqual(seen, [["default"]]);
  assert.equal(context.promptProfilePublication?.profiles[0]?.id, "default");
});
