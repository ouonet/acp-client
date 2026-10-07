import type { AssistantTurn, ContentBlock, MessageChunk } from "../../../core/types/session";

export function contentText(content: string | ContentBlock[] = ""): string {
  return typeof content === "string" ? content : content.map(block => {
    if (block.type === "text") return block.text;
    if (block.type === "resource") return block.resource.text ?? block.resource.uri;
    if (block.type === "resource_link") return block.uri;
    return "";
  }).filter(Boolean).join("\n");
}

export function executionTurns(message: Pick<MessageChunk, "turns" | "thinking" | "toolCalls">): AssistantTurn[] {
  if (message.turns?.length) return message.turns;
  if (message.thinking !== undefined || message.toolCalls?.length) {
    return [{ thinking: message.thinking, toolCalls: message.toolCalls ?? [] }];
  }
  return [];
}

export function elapsed(startedAt?: number, completedAt?: number, now = Date.now()): string {
  if (startedAt === undefined) return "";
  const seconds = Math.max(0, ((completedAt ?? now) - startedAt) / 1000);
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
}

export function formatToolValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2) ?? ""; }
  catch { return String(value); }
}

export function toolPreview(value: unknown): string {
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    value = input.path ?? input.filePath ?? input.command ?? input.query ?? value;
  }
  const text = formatToolValue(value).replace(/\s+/g, " ");
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

export function copyText(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => {});
}
