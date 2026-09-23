import type { AgentRuntimeInternal } from "../internal.js";
import type { ContinueActiveTargetLoopOptions, TurnResult } from "../types.js";
import { createRuntimeCommandId } from "../command-queue.js";
import type { TargetContinuationLoopRuntimeCommand } from "../command-queue.js";
import { executeTargetContinuationCommand } from "./target.js";
import { createMessageId, createTurnId } from "../deps.js";
import { settleGoalContinuation, takeVisibleGoalStop, visibleGoalStopTurnResult } from "../goal-stop.js";
import { enqueueCancellableRuntimeCommand } from "./runtime-command-submit.js";

interface RunActiveTargetContinuationLoopOptions extends ContinueActiveTargetLoopOptions {
  yieldBeforeFirstContinue?: boolean;
}

export async function continueActiveTargetLoop(
  this: AgentRuntimeInternal,
  options: ContinueActiveTargetLoopOptions,
): Promise<TurnResult | null> {
  const traceContext = options.traceContext ?? this.rootTraceContext;

  return await enqueueCancellableRuntimeCommand<
    TurnResult | null,
    TargetContinuationLoopRuntimeCommand
  >(this, {
    abortSignal: options.abortSignal,
    createCommand: ({ reject, resolve }) => ({
      createdAt: new Date(),
      id: createRuntimeCommandId(),
      mode: "target-continuation-loop",
      options: {
        ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
        ...(options.inputId !== undefined ? { inputId: options.inputId } : {}),
        ...(options.intent ? { intent: options.intent } : {}),
        traceContext,
        trigger: options.trigger,
        ...(options.verifyBeforeFirstContinue !== undefined
          ? { verifyBeforeFirstContinue: options.verifyBeforeFirstContinue }
          : {}),
      },
      priority: "next",
      reject,
      resolve,
      traceContext,
    }),
  });
}

export async function runActiveTargetContinuationLoop(
  this: AgentRuntimeInternal,
  options: RunActiveTargetContinuationLoopOptions,
): Promise<TurnResult | null> {
  const traceContext = options.traceContext ?? this.rootTraceContext;
  let verifyBeforeContinue = options.verifyBeforeFirstContinue === true;
  let lastResult: TurnResult | null = null;
  let yieldToPendingCommands = options.yieldBeforeFirstContinue !== false;
  let continuationIntent = options.intent;

  while (!options.abortSignal?.aborted) {
    if (yieldToPendingCommands && this.runtimeCommandQueue.hasPending()) {
      return lastResult;
    }

    if (
      options.trigger === "task-notification" &&
      verifyBeforeContinue &&
      this.config.targetCompletionVerification?.enabled === false
    ) {
      return lastResult;
    }

    // 第一次校验失败时 lastResult 仍是 null。命令抛错或只记住停止都不能再抛出去，
    // 否则 task-notification 捕获后返回 null，失败对用户不可见。
    let result: TurnResult | null = null;
    let commandError: unknown;
    try {
      result = await executeTargetContinuationCommand.call(this, {
        ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
        ...(options.inputId !== undefined ? { inputId: options.inputId } : {}),
        ...(continuationIntent ? { intent: continuationIntent } : {}),
        traceContext,
        verifyBeforeContinue,
      });
    } catch (error) {
      commandError = error;
    }
    const settled = settleGoalContinuation({
      lastResult,
      commandResult: result,
      commandError,
      goalStop: takeVisibleGoalStop(this),
    });
    if (settled.kind === "rethrow") throw commandError;
    if (settled.kind === "stop") {
      const stop = { kind: "goal-stop" as const, visible: true as const, passed: false as const, message: settled.message };
      try {
        return (await visibleGoalStopTurnResult(
          {
            getProjection: () => this.getProjection(),
            persistSyntheticUserNoticeForSession: (input) =>
              this.persistSyntheticUserNoticeForSession({
                ...input,
                messageID: input.messageID as never,
                sessionId: input.sessionId as never,
                traceContext: input.traceContext as never,
              }),
            sessionId: this.sessionId,
          },
          stop,
          traceContext,
          {
            fallbackTurnId: createTurnId(),
            messageId: createMessageId(),
          },
        )) as unknown as TurnResult;
      } catch {
        return {
          events: [],
          projection: {
            activeToolCalls: [],
            backgroundTasks: [],
            contextUsed: 0,
            contextWindow: 0,
            createdAt: new Date(0),
            id: this.sessionId,
            mode: this.config.mode ?? "build",
            pendingPermissions: [],
            pendingSteerInputs: [],
            status: "idle",
            streamingToolLedger: [],
            targetCompletionVerificationTimeline: [],
            targetCompletionVerifications: [],
            totalTokenCount: 0,
            turnCount: 0,
            updatedAt: new Date(0),
          },
          response: settled.message,
          traceId: traceContext.traceId,
          turnId: createTurnId(),
        };
      }
    }
    if (!result) return lastResult;

    lastResult = result;
    // 第一次 continuation 应用并持久化本次 Submission；后续自动轮次读取新的
    // Session Selection，从而沿用上一轮，也允许中间插入的用户 Turn 成为新权威。
    continuationIntent = undefined;
    verifyBeforeContinue = true;
    yieldToPendingCommands = true;
  }

  return lastResult;
}
