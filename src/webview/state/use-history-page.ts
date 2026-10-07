import { useEffect, useRef, useState } from "preact/hooks";
import type { ExtensionMessage } from "../../shared/ipc-protocol";
import { useAppStore } from "./store-context";
import { useAction } from "./action-context";
import { requestId } from "../utils/request-id";

export type HistorySession = Extract<ExtensionMessage, { type: "AGENT_HISTORY_RESULT" }>["payload"]["sessions"][number];

export function useHistoryPage(open: boolean) {
  const [state] = useAppStore();
  const send = useAction();
  const agentId = state.agent.selectedAgentId;
  const connection = state.agent.connections?.find((c) => c.agentId === agentId);
  const canList = !!connection?.capabilities?.sessionCapabilities?.list;
  const key = `${open}:${agentId}:${connection?.generation}:${connection?.initialized}`;
  const view = useRef({ key, epoch: 0 });
  if (view.current.key !== key) view.current = { key, epoch: view.current.epoch + 1 };
  const epoch = view.current.epoch;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<HistorySession[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [request, setRequest] = useState<string>();
  const pending = useRef<{ id: string; append: boolean; epoch: number } | undefined>(undefined);
  const result = request ? state.agent.historyResults?.[request] : undefined;
  const invalidate = () => {
    pending.current = undefined;
    setRequest(undefined);
    setCursor(undefined);
    setLoading(false);
  };
  const fetchPage = (next?: string) => {
    if (!open || !agentId || !canList || !connection?.initialized) return;
    const id = requestId();
    pending.current = { id, append: !!next, epoch };
    setRequest(id);
    setLoading(true);
    setError(undefined);
    send({ type: "REQUEST_AGENT_HISTORY", payload: { agentId, requestId: id, cursor: next } });
  };
  useEffect(() => {
    invalidate();
    setPage([]);
    setError(undefined);
    setQuery("");
    if (open) fetchPage();
  }, [key]);
  useEffect(() => {
    const current = pending.current;
    if (
      !result ||
      !current ||
      result.requestId !== current.id ||
      current.epoch !== epoch ||
      result.agentId !== agentId ||
      (result.generation !== undefined && result.generation !== connection?.generation)
    )
      return;
    setLoading(false);
    setError(result.error);
    if (!result.error) {
      setPage((previous) =>
        current.append
          ? [...previous, ...result.sessions.filter((s: HistorySession) => !previous.some((p) => p.id === s.id))]
          : result.sessions,
      );
      setCursor(result.nextCursor);
    }
  }, [result]);
  const deleted = (sessionId: string) => {
    invalidate();
    setPage((previous) => previous.filter((s) => s.id !== sessionId));
    fetchPage();
  };
  const normalized = query.trim().toLowerCase();
  const filtered = page.filter((s) =>
    [s.title, s.id, s.cwd].some((value) => value?.toLowerCase().includes(normalized)),
  );
  return {
    agentId,
    connection,
    canList,
    epoch,
    query,
    setQuery,
    filtered,
    cursor,
    loading,
    error,
    fetchPage,
    invalidate,
    deleted,
  };
}
