import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useAppStore } from "./store-context";
import { useAction } from "./action-context";
import { requestId } from "../utils/request-id";
import type { useHistoryPage } from "./use-history-page";

type Operation = "SWITCH_SESSION" | "DELETE_SESSION";
interface Pending {
  id: string;
  type: Operation;
  sessionId: string;
  agentId: string;
  generation: number;
  epoch: number;
}

export function useHistoryOperation(open: boolean, history: ReturnType<typeof useHistoryPage>, onClose: () => void) {
  const [state, dispatch] = useAppStore();
  const send = useAction();
  const pending = useRef<Record<string, Pending>>({});
  const [requests, setRequests] = useState(pending.current);
  const [error, setError] = useState<string>();
  const { agentId, connection, epoch } = history;
  const active = agentId ? requests[agentId] : undefined;
  const busy = !!active && active.generation === connection?.generation;
  const current = state.session.activeSession;
  const streaming =
    !!current &&
    current.agentId === agentId &&
    (current.status === "streaming" || current.status === "waiting_approval");
  const reason = !connection?.initialized
    ? "Connect this Agent first"
    : streaming
      ? "Finish or close the current Session first"
      : busy || (agentId && state.agent.lifecyclePending?.[agentId])
        ? "An Agent operation is pending"
        : history.loading
          ? "Loading history"
          : undefined;
  const finish = (request: Pending) => {
    if (pending.current[request.agentId]?.id !== request.id) return;
    const remaining = { ...pending.current };
    delete remaining[request.agentId];
    pending.current = remaining;
    setRequests(remaining);
    dispatch({ type: "LIFECYCLE_FINISHED", payload: { agentId: request.agentId, requestId: request.id } });
  };
  useEffect(() => setError(undefined), [epoch]);
  useLayoutEffect(() => {
    for (const request of Object.values(pending.current)) {
      const owner = state.agent.connections?.find((c) => c.agentId === request.agentId);
      const visible = open && request.epoch === epoch && request.agentId === agentId;
      if (!owner?.initialized || owner.generation !== request.generation) {
        finish(request);
        if (visible) setError("Connection changed. Refresh history to check the Session before retrying.");
        continue;
      }
      const result = state.agent.actionResults?.[request.id];
      if (
        !result ||
        (result.action !== undefined && result.action !== request.type) ||
        result.agentId !== request.agentId ||
        ("generation" in result && result.generation !== undefined && result.generation !== request.generation)
      ) {
        // Keep the shared lock if an unrelated/stale receipt cleared it.
        if (!state.agent.lifecyclePending?.[request.agentId]) {
          dispatch({ type: "LIFECYCLE_STARTED", payload: { agentId: request.agentId, requestId: request.id } });
        }
        continue;
      }
      finish(request);
      if (!visible) continue;
      if (!result.success)
        setError(result.error || `Unable to ${request.type === "DELETE_SESSION" ? "delete" : "load"} Session`);
      else if (request.type === "DELETE_SESSION") history.deleted(request.sessionId);
      else onClose();
    }
  }, [state, epoch]);
  useEffect(
    () => () => {
      for (const request of Object.values(pending.current)) {
        dispatch({ type: "LIFECYCLE_FINISHED", payload: { agentId: request.agentId, requestId: request.id } });
      }
    },
    [],
  );
  const invoke = (type: Operation, sessionId: string) => {
    if (!open || !agentId || !connection || reason || pending.current[agentId]) return;
    const caps = connection.capabilities;
    if (
      type === "DELETE_SESSION"
        ? !caps?.sessionCapabilities?.delete
        : !(caps?.loadSession || caps?.sessionCapabilities?.load)
    )
      return;
    const request: Pending = { id: requestId(), type, sessionId, agentId, generation: connection.generation, epoch };
    pending.current = { ...pending.current, [agentId]: request };
    setRequests(pending.current);
    setError(undefined);
    if (type === "DELETE_SESSION") history.invalidate();
    dispatch({ type: "LIFECYCLE_STARTED", payload: { agentId, requestId: request.id } });
    try {
      send({ type, payload: { sessionId, agentId, generation: request.generation, requestId: request.id } });
    } catch (failure) {
      finish(request);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  return { invoke, reason, error, active: busy ? active : undefined };
}
