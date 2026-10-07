import { useRef, useState } from "preact/hooks";
import type { WebviewAction } from "../../shared/ipc-protocol";
import { useAppStore } from "./store-context";
import { useAction } from "./action-context";
import { requestId } from "../utils/request-id";

type LifecycleAction = "CONNECT_AGENT" | "DISCONNECT_AGENT" | "CREATE_SESSION" | "CLOSE_SESSION";

export function useLifecycleActions() {
  const [state, dispatch] = useAppStore();
  const send = useAction();
  const pending = state.agent.lifecyclePending || {};
  const requests = useRef(pending);
  requests.current = pending;
  const [lastRequest, setLastRequest] = useState<string>();

  const invoke = (type: LifecycleAction, agentId: string, omitGeneration = false) => {
    // A ref fences rapid clicks before Preact has rendered the disabled button.
    if (requests.current[agentId]) return;
    const id = requestId();
    requests.current = { ...requests.current, [agentId]: id }; setLastRequest(id);
    dispatch({ type: "LIFECYCLE_STARTED", payload: { agentId, requestId: id } });
    const connection = state.agent.connections?.find(c => c.agentId === agentId);
    const session = state.session.activeSession;
    const payload = {
      agentId, requestId: id,
      ...(!omitGeneration && connection ? { generation: connection.generation } : {}),
      ...(type === "CLOSE_SESSION" && session?.agentId === agentId
        ? { sessionId: session.id, runtimeRevision: session.runtimeRevision } : {}),
    };
    send({ type, payload } as WebviewAction);
    return id;
  };
  return { invoke, pending, lastRequest };
}
