import assert from "node:assert/strict";
import test from "node:test";
import { buildVisibleGoalStop, settleGoalContinuation, visibleGoalStopTurnResult } from "./goal-stop.js";

test("first failed goal verification returns a visible stop result", async () => {
  const notices: Array<{ text: string; visibility: string }> = [];
  const stop = buildVisibleGoalStop({ reason: "tests failed" });
  const result = await visibleGoalStopTurnResult(
    {
      getProjection: async () => ({}),
      persistSyntheticUserNoticeForSession: async (input) => {
        notices.push({ text: input.text, visibility: input.visibility });
      },
      sessionId: "session-1",
    },
    stop,
    { traceId: "trace-1" },
    { fallbackTurnId: "turn-1", messageId: "message-1" },
  );
  assert.equal(result.response, "Goal verification failed: tests failed");
  assert.equal(notices[0]?.visibility, "user-visible");
  assert.equal(notices[0]?.text, result.response);
});

test("first failed verification with a null last result is a visible stop, not a swallowed throw", () => {
  const thrown = settleGoalContinuation({
    lastResult: null,
    commandResult: null,
    commandError: new Error("Goal verification failed: tests failed"),
  });
  assert.equal(thrown.kind, "stop");
  if (thrown.kind === "stop") {
    assert.equal(thrown.message, "Goal verification failed: tests failed");
  }
  const remembered = settleGoalContinuation({
    lastResult: null,
    commandResult: null,
    goalStop: buildVisibleGoalStop({ reason: "tests failed" }),
  });
  assert.equal(remembered.kind, "stop");
  if (remembered.kind === "stop") {
    assert.equal(remembered.message, "Goal verification failed: tests failed");
  }
});
