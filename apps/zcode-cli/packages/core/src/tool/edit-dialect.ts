import { inferModelFamily } from "../context/prompt-profile.js";

export type EditToolName = "Edit" | "ApplyPatch";

const EDIT_TOOLS = new Set<EditToolName>(["Edit", "ApplyPatch"]);

export function editToolForFamily(family: string): EditToolName {
  return family === "openai" ? "ApplyPatch" : "Edit";
}

export function editToolForModel(providerId: string, modelId: string): EditToolName {
  return editToolForFamily(inferModelFamily(providerId, modelId));
}

export function filterEditTools<T extends { name: string }>(
  tools: readonly T[],
  keep: EditToolName,
): T[] {
  return tools.filter((tool) => !EDIT_TOOLS.has(tool.name as EditToolName) || tool.name === keep);
}

const COMPUTER_USE_NAME = /computer[-_ ]?use/i;
const BROWSER_TOOL_NAME = /^(browser|browser_use|BrowserUse)$/i;

export function isComputerUseToolName(name: string): boolean {
  return COMPUTER_USE_NAME.test(name);
}

export function isBrowserControlToolName(name: string): boolean {
  return BROWSER_TOOL_NAME.test(name) || name.startsWith("mcp__browser");
}

export function filterDefaultModelTools<T extends { name: string }>(
  tools: readonly T[],
  options: { browserPermissionGated?: boolean; editTool: EditToolName },
): T[] {
  return filterEditTools(tools, options.editTool).filter((tool) => {
    if (isComputerUseToolName(tool.name)) return false;
    if (isBrowserControlToolName(tool.name) && options.browserPermissionGated !== true) return false;
    return true;
  });
}
