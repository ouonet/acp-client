import { useEffect, useRef, useState } from "preact/hooks";
import { useAppStore } from "../../state/store-context";
import { useAction } from "../../state/action-context";
import { AgentStatusDot } from "./agent-status-dot";
import { ActionIcon } from "../action-icon";
import { ConnectionInfo } from "./connection-info";
import { useHeaderMenus } from "../../state/use-header-menus";
import { useLifecycleActions } from "../../state/use-lifecycle-actions";

export function HeaderBar() {
  const [state] = useAppStore();
  const send = useAction();
  const tabs = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState<string>();
  const [overflowing, setOverflowing] = useState(false);
  const header = useHeaderMenus();
  const { invoke, pending, lastRequest } = useLifecycleActions();
  const [reconnect, setReconnect] = useState<{ id: string; agentId: string }>();
  const { agentConfigs, selectedAgentId, connections = [], actionResult } = state.agent;
  const current = connections.find(c => c.agentId === selectedAgentId);
  const session = state.session.activeSession;
  const busy = session?.status === "streaming" || session?.status === "waiting_approval";
  const currentPending = !!(selectedAgentId && pending[selectedAgentId]);
  const enabledConfigs = agentConfigs.filter(c => c.enabled !== false);
  useEffect(() => {
    if (reconnect && actionResult?.requestId === reconnect.id) {
      setReconnect(undefined);
      if (actionResult.success) invoke("CONNECT_AGENT", reconnect.agentId, true);
    }
  }, [actionResult]);
  const retry = (agentId: string) => {
    if (connections.some(c => c.agentId === agentId)) {
      const id = invoke("DISCONNECT_AGENT", agentId);
      if (id) setReconnect({ id, agentId });
    }
    else invoke("CONNECT_AGENT", agentId);
  };
  useEffect(() => tabs.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest", inline: "nearest" }), [selectedAgentId]);
  useEffect(() => {
    const el = tabs.current;
    if (!el) return;
    const measure = () => {
      const next = connections.length > 1 && el.scrollWidth > el.clientWidth;
      setOverflowing(shown => (shown === next ? shown : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [connections, agentConfigs, selectedAgentId]);
  const select = (agentId: string) => send({ type: "SELECT_AGENT", payload: { agentId } });
  const name = (id: string) => agentConfigs.find(c => c.id === id)?.name || id;
  const activeIndex = connections.findIndex(c => c.agentId === selectedAgentId);
  const tabKey = (e: KeyboardEvent, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? connections.length - 1 : (index + (e.key === "ArrowLeft" ? -1 : 1) + connections.length) % connections.length;
    select(connections[next].agentId);
    (e.currentTarget as HTMLElement).closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  return <><header ref={header} className="acp-header lifecycle-header">
    <div className="agent-header">
      <div ref={tabs} className="agent-tabs header-left" role="tablist" aria-label="Connected Agents">
        {connections.map((c, i) => {
          const runtime = state.session.sessions.find(s => s.agentId === c.agentId);
          const badge = runtime?.status === "waiting_approval" ? "Approval" : runtime?.status === "streaming" ? "Working" : undefined;
          return <div className="agent-tab-group" key={c.agentId}>
            <button type="button" role="tab" data-agent-id={c.agentId} aria-selected={c.agentId === selectedAgentId} tabIndex={i === Math.max(0, activeIndex) ? 0 : -1} onKeyDown={e => tabKey(e, i)} onClick={() => select(c.agentId)}>
              <AgentStatusDot status={c.status} /><span>{name(c.agentId)}</span><span className="sr-only">{c.status}</span>{badge && <span className="badge">{badge}</span>}
            </button>
            <button type="button" className="action-icon-btn agent-tab-close" aria-label={`Disconnect ${name(c.agentId)}`} title={`Disconnect ${name(c.agentId)}`} disabled={!!pending[c.agentId]} onClick={() => invoke("DISCONNECT_AGENT", c.agentId)}><ActionIcon name="close" /></button>
          </div>;
        })}
        {!connections.length && <span className="empty-agent">Connect an Agent</span>}
      </div>
      {overflowing && <details className="header-menu agent-overflow"><summary className="action-icon-btn" aria-label="Agent overflow" title="More Agents"><ActionIcon name="more" /></summary><div className="menu-content">{connections.map(c => <button key={c.agentId} type="button" onClick={() => select(c.agentId)}>{`${name(c.agentId)} · ${c.status}`}</button>)}</div></details>}
      <details className="header-menu connect-menu"><summary className="action-icon-btn" aria-label="Connect Agent" title="Connect Agent"><ActionIcon name="connect" /></summary><div className="menu-content">{enabledConfigs.map(c => <button key={c.id} disabled={!!pending[c.id] || connections.some(connection => connection.agentId === c.id && connection.status === "starting")} onClick={() => invoke("CONNECT_AGENT", c.id)}>{c.name || c.id}</button>)}{!enabledConfigs.length && <button onClick={() => send({ type: "TOGGLE_CONFIG" })}>Configure Agent</button>}</div></details>
      <button type="button" className="action-icon-btn" data-action="toggle-config" aria-label="Agent Settings" title="Agent Settings" onClick={() => send({ type: "TOGGLE_CONFIG" })}><ActionIcon name="settings" /></button>
    </div>
    <div className="session-header">
      <div className="session-heading"><span>{session?.title || "No current Session"}</span>{session && <span className="badge">{session.status}</span>}</div>
      {current && <button type="button" className="action-icon-btn" aria-label={`Connection information for ${name(current.agentId)}`} title={`Connection information for ${name(current.agentId)}`} onClick={() => setInfo(current.agentId)}><ActionIcon name="info" /></button>}
      <button type="button" className="action-icon-btn" data-action="new-session" aria-label="New Chat Session" title="New Chat Session" disabled={!current?.initialized || busy || currentPending} onClick={() => selectedAgentId && invoke("CREATE_SESSION", selectedAgentId)}><ActionIcon name="newChat" /></button>
      <button type="button" className="action-icon-btn" data-action="toggle-history" aria-label="Session History" title="Session History" disabled={!current?.initialized} onClick={() => send({ type: "TOGGLE_HISTORY" })}><ActionIcon name="history" /></button>
      <button type="button" className="action-icon-btn" aria-label="Close current Session" title="Close current Session" disabled={!session || currentPending} onClick={() => session && invoke("CLOSE_SESSION", session.agentId)}><ActionIcon name="close" /></button>
      <button type="button" className="action-icon-btn" data-action="show-output" aria-label="View ACP Output Channel Logs" title="View ACP Output Channel Logs" onClick={() => send({ type: "SHOW_OUTPUT" })}><ActionIcon name="terminal" /></button>
    </div>
    {currentPending && <div role="status" className="lifecycle-progress">Updating Agent / Session…</div>}
    {actionResult && !currentPending && (actionResult.requestId === lastRequest || actionResult.agentId === selectedAgentId) && !actionResult.success && <div role="alert" className="inline-error">{actionResult.error || "Action failed"}</div>}
  </header>
    {info && <ConnectionInfo agentId={info} onClose={() => setInfo(undefined)} onReconnect={() => retry(info)} />}
  </>;
}
