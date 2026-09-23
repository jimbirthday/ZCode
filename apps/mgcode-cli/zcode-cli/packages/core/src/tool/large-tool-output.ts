const SUMMARY_CHARS = 160;

export function summarizeLargeToolResult(input: {
  content: string;
  path: string;
  originalBytes: number;
}): string {
  const firstLine = input.content.split("\n").find((line) => line.trim().length > 0) ?? "";
  const summary = firstLine.trim().slice(0, SUMMARY_CHARS);
  return [
    `Tool output summary (${input.originalBytes} bytes): ${summary}`,
    `Full output path: ${input.path}`,
  ].join("\n");
}

export function modelMessageOmitsLargeBody(message: string, fullBody: string): boolean {
  if (fullBody.length <= SUMMARY_CHARS) return true;
  return !message.includes(fullBody);
}
