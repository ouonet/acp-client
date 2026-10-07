import { useEffect, useRef, useState } from "preact/hooks";
import type { InputState } from "./types";
import { useAppStore } from "./store-context";
import { useAction } from "./action-context";
import { requestId } from "../utils/request-id";
import { canRestorePrompt } from "../components/chat/message-prompt";
import { resolveMessageAction, type PendingMessageAction } from "./message-action-result";

type Pending = PendingMessageAction & { timer: ReturnType<typeof setTimeout> };

export function useMessageActions() {
  const [state, dispatch] = useAppStore();
  const send = useAction();
  const pending = useRef<Pending | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const session = state.session.activeSession;
  const connection = state.agent.connections?.find(item => item.agentId === session?.agentId);
  const disabledReason = !session || session.attached === false || !connection?.initialized
    ? "Connect this Session's Agent first"
    : session.status === "streaming" || session.status === "waiting_approval" || state.session.pendingPermission || state.input.isSubmitting
      ? "Wait for the current prompt to finish"
      : busy || state.agent.lifecyclePending?.[session.agentId] ? "An Agent operation is pending" : undefined;

  const finish = (request: Pending, message = "", restore?: Pick<InputState, "draft" | "attachments">) => {
    if (pending.current?.requestId !== request.requestId) return;
    pending.current = undefined; clearTimeout(request.timer); setBusy(false); setFeedback(message);
    dispatch({ type: "LIFECYCLE_FINISHED", payload: { agentId: request.agentId, requestId: request.requestId } });
    if (restore) dispatch({ type: "RESTORE_PROMPT", payload: restore });
  };

  useEffect(() => {
    const request = pending.current;
    if (!request) return;
    const outcome = resolveMessageAction(request, state);
    if (outcome.settled) finish(request, outcome.feedback, outcome.restore);
  }, [state]);

  useEffect(() => () => {
    const request = pending.current;
    if (request) {
      clearTimeout(request.timer);
      dispatch({ type: "LIFECYCLE_FINISHED", payload: { agentId: request.agentId, requestId: request.requestId } });
    }
  }, []);

  const invoke = (mode: "fork" | "rewind", index: number) => {
    const message = session?.messages[index];
    if (pending.current || disabledReason || !session || !connection || message?.role !== (mode === "rewind" ? "user" : "assistant")) return;
    if (mode === "rewind" && !canRestorePrompt(message.content)) return;
    const id = requestId();
    const request: Pending = { requestId: id, mode, agentId: session.agentId, sourceSessionId: session.id,
      generation: connection.generation, boundary: mode === "rewind" ? index - 1 : index,
      content: structuredClone(message.content),
      timer: setTimeout(() => finish(request, mode === "rewind"
        ? "Rewind outcome unconfirmed. The current Session was kept; input was kept."
        : "Fork outcome unconfirmed. Check Agent history before retrying; input was kept."), 20000),
    };
    pending.current = request; setBusy(true); setFeedback("");
    dispatch({ type: "LIFECYCLE_STARTED", payload: { agentId: session.agentId, requestId: id } });
    try {
      send(mode === "rewind"
        ? { type: "REWIND_SESSION", payload: { sourceSessionId: session.id, agentId: session.agentId, generation: connection.generation, runtimeRevision: session.runtimeRevision, requestId: id, upToMessageIndex: request.boundary } }
        : { type: "FORK_SESSION", payload: { sourceSessionId: session.id, agentId: session.agentId, generation: connection.generation, runtimeRevision: session.runtimeRevision, requestId: id, options: { sourceAgentId: session.agentId, upToMessageIndex: request.boundary } } });
    } catch (error) { finish(request, error instanceof Error ? error.message : String(error)); }
  };
  return { invoke, disabledReason, feedback };
}
