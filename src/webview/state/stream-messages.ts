import type { MessageChunk, ToolCall } from "../../core/types/session";

function preserveText(current: string | undefined, incoming: string | undefined): string | undefined {
  return current && incoming !== undefined && current.startsWith(incoming) ? current : incoming;
}
function mergeTools(current: ToolCall[] = [], incoming: ToolCall[] = []): ToolCall[] {
  const tools = new Map(current.map(tool => [tool.id, tool]));
  for (const tool of incoming) {
    const prior = tools.get(tool.id);
    const terminal = prior && ["completed", "failed", "denied"].includes(prior.status);
    tools.set(tool.id, { ...prior, ...tool,
      output: tool.output ?? prior?.output,
      startedAt: tool.startedAt ?? prior?.startedAt,
      completedAt: tool.completedAt ?? prior?.completedAt,
      status: terminal && ["pending", "running"].includes(tool.status) ? prior.status : tool.status,
    });
  }
  return [...tools.values()];
}

/** Keep newer streamed prefixes when a same-turn snapshot arrives behind the UI. */
export function reconcileHistory(current: MessageChunk[], incoming: MessageChunk[]): MessageChunk[] {
  const next = structuredClone(incoming);
  for (let index = 0; index < next.length; index++) {
    const prior = current[index], message = next[index];
    if (!prior || prior.role !== "assistant" || message.role !== "assistant") continue;
    if (prior.startedAt && message.startedAt && prior.startedAt !== message.startedAt) continue;
    if (typeof prior.content === "string" && typeof message.content === "string") {
      message.content = preserveText(prior.content, message.content) ?? "";
    }
    message.startedAt ??= prior.startedAt;
    message.completedAt ??= prior.completedAt;
    message.thinking = preserveText(prior.thinking, message.thinking ?? "");
    message.toolCalls = mergeTools(prior.toolCalls, message.toolCalls);
    if (prior.turns) {
      message.turns = (message.turns || []).map((turn, i) => ({ ...turn,
        startedAt: turn.startedAt ?? prior.turns?.[i]?.startedAt,
        completedAt: turn.completedAt ?? prior.turns?.[i]?.completedAt,
        thinking: preserveText(prior.turns?.[i]?.thinking, turn.thinking ?? ""),
        toolCalls: mergeTools(prior.turns?.[i]?.toolCalls, turn.toolCalls),
      }));
      for (let i = message.turns.length; i < prior.turns.length; i++) message.turns.push(structuredClone(prior.turns[i]));
    }
  }
  // One assistant turn can start locally before the snapshot includes its placeholder.
  // A shorter snapshot that drops completed messages is a rewind or fork and stays shorter.
  const extra = current.slice(next.length);
  if (extra.length === 1 && extra[0].role === "assistant" && extra[0].completedAt === undefined) {
    next.push(structuredClone(extra[0]));
  }
  return next;
}

export function updateAssistant(messages: MessageChunk[], update: (message: MessageChunk) => void, startedAt?: number): MessageChunk[] {
  const next = structuredClone(messages);
  let message = next[next.length - 1];
  if (!message || message.role !== "assistant" || (startedAt !== undefined && startedAt !== message.startedAt)) {
    message = { role: "assistant", content: "", startedAt };
    next.push(message);
  }
  update(message);
  return next;
}

export function eventText(payload: unknown, thinking = false): string {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";
  const value = payload as Record<string, any>;
  const content = value.content;
  return (thinking && typeof value.thinking === "string" ? value.thinking : undefined)
    ?? (typeof content === "string" ? content : typeof content?.text === "string" ? content.text : undefined)
    ?? (typeof value.text === "string" ? value.text : "");
}
