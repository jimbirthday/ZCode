export interface SubagentBudgetStop {
  stop: boolean;
  message?: string;
}

export function decideSubagentBudgetStop(input: {
  taskType?: string;
  modelStepCount: number;
  maxTurns?: number;
}): SubagentBudgetStop {
  if (input.taskType !== "subagent_child" && input.taskType !== "workflow_child") {
    return { stop: false };
  }
  const maxTurns = input.maxTurns;
  if (maxTurns === undefined || maxTurns < 1) return { stop: false };
  if (input.modelStepCount >= maxTurns) {
    return {
      stop: true,
      message: `Subagent budget exhausted after ${input.modelStepCount} steps (max ${maxTurns}).`,
    };
  }
  return { stop: false };
}
