export interface VisibleGoalStop {
  kind: "goal-stop";
  visible: true;
  passed: false;
  message: string;
}

export function buildVisibleGoalStop(input: { reason?: string }): VisibleGoalStop {
  const reason = input.reason?.trim() || "goal verification failed";
  return {
    kind: "goal-stop",
    visible: true,
    passed: false,
    message: `Goal verification failed: ${reason}`,
  };
}

const pendingStops = new WeakMap<object, VisibleGoalStop>();

export function rememberVisibleGoalStop(owner: object, stop: VisibleGoalStop): void {
  pendingStops.set(owner, stop);
}

export function takeVisibleGoalStop(owner: object): VisibleGoalStop | undefined {
  const stop = pendingStops.get(owner);
  if (stop) pendingStops.delete(owner);
  return stop;
}

export async function visibleGoalStopTurnResult<
  TProjection extends { currentTurnId?: string },
  TTrace extends { traceId: string },
>(
  runtime: {
    getProjection: () => Promise<TProjection>;
    persistSyntheticUserNoticeForSession: (input: {
      messageID: string;
      sessionId: string;
      source: "goal_state_change";
      text: string;
      traceContext: TTrace;
      visibility: "user-visible";
    }) => Promise<void>;
    sessionId: string;
  },
  goalStop: VisibleGoalStop,
  traceContext: TTrace,
  ids: { messageId: string; fallbackTurnId: string },
): Promise<{
  events: [];
  projection: TProjection;
  response: string;
  traceId: string;
  turnId: string;
}> {
  await runtime.persistSyntheticUserNoticeForSession({
    messageID: ids.messageId,
    sessionId: runtime.sessionId,
    source: "goal_state_change",
    text: goalStop.message,
    traceContext,
    visibility: "user-visible",
  });
  const projection = await runtime.getProjection();
  return {
    events: [],
    projection,
    response: goalStop.message,
    traceId: traceContext.traceId,
    turnId: projection.currentTurnId ?? ids.fallbackTurnId,
  };
}

export type GoalContinuationSettlement =
  | { kind: "stop"; message: string }
  | { kind: "idle" }
  | { kind: "continue" }
  | { kind: "rethrow" };

/**
 * 第一次目标校验失败时 lastResult 仍是 null。这里必须给出可见停止，
 * 不能把异常抛回 task-notification，否则捕获后返回 null，用户看不到失败。
 */
export function settleGoalContinuation(input: {
  lastResult: { response?: string } | null;
  commandResult: { response?: string } | null;
  commandError?: unknown;
  goalStop?: VisibleGoalStop;
}): GoalContinuationSettlement {
  void input.lastResult;
  if (input.goalStop) {
    return { kind: "stop", message: input.goalStop.message };
  }
  const errorMessage =
    input.commandError instanceof Error
      ? input.commandError.message
      : input.commandError === undefined
        ? ""
        : String(input.commandError);
  if (errorMessage.startsWith("Goal verification failed")) {
    return { kind: "stop", message: errorMessage };
  }
  if (input.commandResult?.response?.startsWith("Goal verification failed")) {
    return { kind: "stop", message: input.commandResult.response };
  }
  if (input.commandError) return { kind: "rethrow" };
  if (!input.commandResult) return { kind: "idle" };
  return { kind: "continue" };
}

export function isVisibleGoalStop(value: unknown): value is VisibleGoalStop {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: string }).kind === "goal-stop" &&
    (value as { visible?: boolean }).visible === true
  );
}
