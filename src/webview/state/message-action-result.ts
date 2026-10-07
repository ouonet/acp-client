import type { ContentBlock } from "../../core/types/session";
import type { WebviewAppState } from "./types";
import { restorePrompt } from "../components/chat/message-prompt";

export interface PendingMessageAction {
  requestId: string;
  mode: "fork" | "rewind";
  agentId: string;
  sourceSessionId: string;
  generation: number;
  boundary: number;
  content: string | ContentBlock[];
}

type Settlement = { settled: false } | { settled: true; feedback?: string; restore?: ReturnType<typeof restorePrompt> };

/** Remote receipts and snapshots may arrive in either order. Neither alone permits restoration. */
export function resolveMessageAction(pending: PendingMessageAction, state: WebviewAppState): Settlement {
  const connection = state.agent.connections?.find(item => item.agentId === pending.agentId);
  const active = state.session.activeSession;
  const changed = { settled: true as const, feedback: "Session or Agent changed; input was kept." };
  if (!connection?.initialized || connection.generation !== pending.generation || state.agent.selectedAgentId !== pending.agentId) return changed;
  const receipt = state.agent.actionResults?.[pending.requestId] ?? state.agent.actionResult;
  if (!receipt || receipt.requestId !== pending.requestId || receipt.agentId !== pending.agentId) return { settled: false };
  if (pending.mode === "rewind") {
    if (receipt.action !== "REWIND_SESSION") return { settled: false };
    if (!receipt.success) return { settled: true, feedback: receipt.error || "Rewind failed; input was kept." };
    if (!active || active.id !== pending.sourceSessionId) return changed;
    const kept = pending.boundary < 0 ? 0 : pending.boundary + 1;
    if (active.messages.length !== kept) return { settled: false };
  } else {
    if (active && active.id !== pending.sourceSessionId && (active.agentId !== pending.agentId || active.parentSessionId !== pending.sourceSessionId || active.forkedFromMessageIndex !== pending.boundary)) return changed;
    if (receipt.action !== "FORK_SESSION") return { settled: false };
    if (!receipt.success) return { settled: true, feedback: receipt.error || "Fork failed; input was kept." };
    if (!receipt.sessionId || receipt.sessionId === pending.sourceSessionId) return { settled: true, feedback: "Fork outcome unconfirmed. Check Agent history; input was kept." };
    if (!active || active.id === pending.sourceSessionId) return { settled: false };
    if (active.id !== receipt.sessionId) return changed;
    return { settled: true };
  }
  if ((state.input.draftRevision ?? 0) !== 0 || state.input.draft || state.input.attachments.length || state.input.isSubmitting) {
    return { settled: true, feedback: "Rewind complete. Your newer input was kept; the original prompt remains in the source Session." };
  }
  return { settled: true, restore: restorePrompt(pending.content, pending.requestId) };
}
