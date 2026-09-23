import { join } from "node:path";

export interface BashSandboxDecision {
  allowed: boolean;
  reason?: string;
}

const CREDENTIAL_DIR_NAMES = [
  ".ssh",
  ".aws",
  ".gnupg",
  ".config/gh",
  ".azure",
  ".kube",
  ".mgcode/cli/credentials",
];

export function credentialDirectories(homeDir: string): string[] {
  return CREDENTIAL_DIR_NAMES.map((name) => join(homeDir, name));
}

function expandHome(command: string, homeDir: string): string {
  const home = homeDir.replace(/\\/g, "/");
  return command
    .replace(/\\/g, "/")
    .replace(/\$\{HOME\}/g, home)
    .replace(/\$HOME\b/g, home)
    .replace(/(^|[\s"'=])~(?=\/)/g, `$1${home}`);
}

const CREDENTIAL_HOME_PATTERN =
  /(?:^|[\s"'=])(?:~|\$HOME|\$\{HOME\})\/\.(?:ssh|aws|gnupg|azure|kube|config\/gh|zcode\/cli\/credentials)(?:\/|\b)/i;

const CREDENTIAL_SEGMENT =
  /(?:^|[\s"'=:/])\.(?:ssh|aws|gnupg|azure|kube)(?:\/|\b)|(?:^|[\s"'=:/])\.config\/gh(?:\/|\b)|(?:^|[\s"'=:/])\.zcode\/cli\/credentials(?:\/|\b)/i;

function collapseDotDot(value: string): string {
  let current = value.replace(/\\/g, "/");
  let previous = "";
  while (current !== previous) {
    previous = current;
    current = current.replace(/\/[^/]+\/\.\.\//g, "/");
  }
  return current;
}

function foldCredentialCase(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}

function mentionsCredentialDirectory(command: string): boolean {
  // macOS 默认不区分大小写，~/.SSH 与 ~/.ssh 是同一目录。匹配前折叠大小写。
  const normalized = foldCredentialCase(collapseDotDot(command));
  return CREDENTIAL_HOME_PATTERN.test(normalized) || CREDENTIAL_SEGMENT.test(normalized);
}

function commandMentions(command: string, path: string): boolean {
  const foldedCommand = foldCredentialCase(command);
  const foldedPath = foldCredentialCase(path);
  return foldedCommand.includes(foldedPath);
}

/**
 * spawn 前拒绝凭证目录。yolo 只是跳过确认，不能把 ~/.ssh、$HOME/.ssh、${HOME}/.aws
 * 读进命令。字面绝对路径不够：未展开的家目录形式必须在这里失败关闭。
 */
export function decideBashSandbox(input: {
  command: string;
  homeDir: string;
  mode?: string;
}): BashSandboxDecision {
  void input.mode;
  const raw = input.command.replace(/\\/g, "/");
  const expanded = collapseDotDot(expandHome(raw, input.homeDir));
  if (mentionsCredentialDirectory(raw) || mentionsCredentialDirectory(expanded)) {
    return { allowed: false, reason: "credential path denied: home credential directory" };
  }
  for (const directory of credentialDirectories(input.homeDir)) {
    if (commandMentions(expanded, directory) || commandMentions(raw, directory)) {
      return {
        allowed: false,
        reason: `credential path denied: ${directory}`,
      };
    }
  }
  return { allowed: true };
}
