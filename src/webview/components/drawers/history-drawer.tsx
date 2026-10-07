import { useEffect, useState } from "preact/hooks";
import { useAppStore } from "../../state/store-context";
import { useHistoryPage } from "../../state/use-history-page";
import { useHistoryOperation } from "../../state/use-history-operation";
import { HistorySessionRow } from "./history-session-row";
import { ModalDrawer } from "./modal-drawer";

export function HistoryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state] = useAppStore();
  const history = useHistoryPage(open);
  const operation = useHistoryOperation(open, history, onClose);
  const [confirmation, setConfirmation] = useState<string>();
  const caps = history.connection?.capabilities;
  const canLoad = !!(caps?.loadSession || caps?.sessionCapabilities?.load);
  const canDelete = !!caps?.sessionCapabilities?.delete;
  const loadReason = !canLoad ? "Loading unsupported" : operation.reason;
  const deleteReason = !canDelete ? "This Agent does not advertise Session deletion" : operation.reason;
  const current = state.session.activeSession;
  useEffect(() => setConfirmation(undefined), [history.epoch]);
  useEffect(() => {
    if (!operation.active) setConfirmation(undefined);
  }, [operation.active]);
  if (!open) return null;
  return (
    <ModalDrawer label="Agent Session History" className="history-drawer" onClose={onClose}>
      <div className="drawer-header">
        <h2>Agent Session History</h2>
        <button aria-label="Close History" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="drawer-search">
        <input
          type="search"
          className="form-control"
          aria-label="Search Agent history"
          placeholder="Search title, Session ID or directory…"
          value={history.query}
          onInput={(e) => history.setQuery(e.currentTarget.value)}
        />
      </div>
      <div className="drawer-body session-list">
        {!history.canList ? (
          <p>This Agent does not advertise Session history listing.</p>
        ) : (
          <>
            {history.loading && <p role="status">Loading history…</p>}
            {operation.active?.type === "SWITCH_SESSION" && <p role="status">Loading Session…</p>}
            {operation.error && <div role="alert">{operation.error}</div>}
            {history.error && (
              <div role="alert">
                {history.error}
                <button disabled={!!operation.active} onClick={() => history.fetchPage()}>
                  Retry
                </button>
              </div>
            )}
            {!history.loading && !history.error && !history.filtered.length && <p>No sessions found</p>}
            {!canLoad && <p>This Agent does not advertise loading previous Sessions.</p>}
            {history.filtered.map((session) => (
              <HistorySessionRow
                key={`${history.epoch}:${session.id}`}
                session={session}
                currentStatus={
                  session.id === current?.id && current.agentId === history.agentId ? current.status : undefined
                }
                loadReason={loadReason}
                deleteReason={deleteReason}
                confirming={confirmation === session.id}
                deleting={operation.active?.type === "DELETE_SESSION" && operation.active.sessionId === session.id}
                onOpen={() => operation.invoke("SWITCH_SESSION", session.id)}
                onDelete={() => {
                  if (!deleteReason) setConfirmation(session.id);
                }}
                onCancel={() => setConfirmation(undefined)}
                onConfirm={() => {
                  if (confirmation === session.id) operation.invoke("DELETE_SESSION", session.id);
                }}
              />
            ))}
            {history.cursor && (
              <button disabled={!!operation.reason} onClick={() => history.fetchPage(history.cursor)}>
                Load more
              </button>
            )}
          </>
        )}
      </div>
    </ModalDrawer>
  );
}
