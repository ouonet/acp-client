import type { AssistantTurn, MessageChunk, ToolCall } from "../../core/types/session";

function turnsFor(message: MessageChunk): AssistantTurn[] {
  return message.turns ?? (message.thinking || message.toolCalls?.length
    ? [{ thinking: message.thinking, toolCalls: structuredClone(message.toolCalls ?? []) }] : []);
}

function targetTurn(message: MessageChunk, payload: Record<string, any>, newThinking: boolean): AssistantTurn {
  message.turns = turnsFor(message);
  const last = message.turns[message.turns.length - 1];
  const index = Number.isInteger(payload.turnIndex) && payload.turnIndex > 0
    ? payload.turnIndex - 1 : Math.max(0, message.turns.length - (newThinking && last?.toolCalls.length ? 0 : 1));
  while (message.turns.length <= index) message.turns.push({ toolCalls: [] });
  if (payload.previousTurnCompletedAt !== undefined && index > 0) message.turns[index - 1].completedAt = payload.previousTurnCompletedAt;
  const turn = message.turns[index];
  turn.startedAt ??= payload.startedAt;
  message.startedAt ??= payload.messageStartedAt;
  return turn;
}

export function projectThinking(message: MessageChunk, payload: unknown, text: string): void {
  const metadata = payload && typeof payload === "object" ? payload : {};
  const turn = targetTurn(message, metadata, true);
  turn.thinking = (turn.thinking ?? "") + text;
  message.thinking = (message.thinking ?? "") + text;
}

function patchTool(tool: ToolCall, payload: Record<string, any>): ToolCall {
  const fields = Object.fromEntries(Object.entries(payload).filter(([key, value]) =>
    ["id", "name", "input", "output", "status", "startedAt", "completedAt"].includes(key) && value !== undefined));
  return { ...tool, ...fields };
}

export function projectToolCall(message: MessageChunk, payload: ToolCall & { turnIndex?: number; messageStartedAt?: number }): void {
  message.turns = turnsFor(message);
  const existingTurn = message.turns.find(turn => turn.toolCalls.some(tool => tool.id === payload.id));
  const turn = existingTurn ?? targetTurn(message, payload, false);
  const existing = turn.toolCalls.find(tool => tool.id === payload.id);
  const next = patchTool(existing ?? { id: payload.id, name: payload.name, input: undefined, status: "pending" }, payload);
  turn.toolCalls = existing ? turn.toolCalls.map(tool => tool.id === payload.id ? next : tool) : [...turn.toolCalls, next];
  const flat = message.toolCalls ?? [];
  message.toolCalls = flat.some(tool => tool.id === payload.id)
    ? flat.map(tool => tool.id === payload.id ? next : tool) : [...flat, next];
}

export function projectToolResult(message: MessageChunk, payload: Record<string, any>): void {
  const update = (tool: ToolCall) => tool.id === payload.id ? patchTool(tool, payload) : tool;
  message.toolCalls = message.toolCalls?.map(update);
  message.turns = message.turns?.map(turn => ({ ...turn, toolCalls: turn.toolCalls.map(update) }));
}

export function finishExecution(message: MessageChunk, at = Date.now()): void {
  if (message.startedAt === undefined || message.completedAt !== undefined) return;
  message.completedAt = at;
  const last = message.turns?.[message.turns.length - 1];
  if (last && last.completedAt === undefined) last.completedAt = at;
}
