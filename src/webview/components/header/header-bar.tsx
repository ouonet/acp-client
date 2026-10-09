import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ProcessStatus } from "../../../core/ports";
import { useAppStore } from "../../state/store-context";
import { useAction } from "../../state/action-context";
import { AgentStatusDot } from "./agent-status-dot";
import { ActionIcon } from "../action-icon";
import { ConnectionInfo } from "./connection-info";
import { useHeaderMenus } from "../../state/use-header-menus";
import { useLifecycleActions } from "../../state/use-lifecycle-actions";
import { packAgentTabs } from "../../utils/pack-agent-tabs";

const MENU_WIDTH = 32;
const TAB_GAP = 4;

type TabKeyEvent = {
  key: string;
  target: EventTarget | null;
  currentTarget: EventTarget | null;
  preventDefault(): void;
};

function ConnectionTab({
  agentId,
  label,
  status,
  badge,
  selected,
  roving,
  interactive,
  pending,
  onSelect,
  onDisconnect,
  onKeyDown,
  onFocus,
}: {
  agentId: string;
  label: string;
  status?: ProcessStatus;
  badge?: string;
  selected: boolean;
  roving: boolean;
  interactive: boolean;
  pending: boolean;
  onSelect: () => void;
  onDisconnect: () => void;
  onKeyDown: (event: TabKeyEvent) => void;
  onFocus: () => void;
}) {
  return (
    <div
      className="agent-tab"
      data-measure-agent={agentId}
      data-agent-id={agentId}
      role={interactive ? "tab" : undefined}
      aria-selected={interactive ? selected : undefined}
      tabIndex={interactive ? (roving ? 0 : -1) : undefined}
      onClick={interactive ? onSelect : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
      onFocus={interactive ? onFocus : undefined}
    >
      <AgentStatusDot status={status} />
      <span>{label}</span>
      <span className="sr-only">{status}</span>
      {badge && <span className="badge">{badge}</span>}
      <button
        type="button"
        className="agent-tab-close"
        aria-label={`Disconnect ${label}`}
        title={`Disconnect ${label}`}
        tabIndex={interactive && roving ? 0 : -1}
        disabled={pending}
        onClick={
          interactive
            ? (event) => {
                event.stopPropagation();
                onDisconnect();
              }
            : undefined
        }
      >
        <ActionIcon name="close" />
      </button>
    </div>
  );
}

export function HeaderBar() {
  const [state] = useAppStore();
  const send = useAction();
  const tabs = useRef<HTMLDivElement>(null);
  const budget = useRef<HTMLDivElement>(null);
  const summary = useRef<HTMLElement>(null);
  const focusedAgent = useRef<string>(undefined);
  const [info, setInfo] = useState<string>();
  const [metrics, setMetrics] = useState<{
    container: number;
    widths: number[];
  }>({ container: 0, widths: [] });
  const header = useHeaderMenus();
  const { invoke, pending, lastRequest } = useLifecycleActions();
  const [reconnect, setReconnect] = useState<{ id: string; agentId: string }>();
  const {
    agentConfigs,
    selectedAgentId,
    connections = [],
    actionResult,
  } = state.agent;
  const current = connections.find((c) => c.agentId === selectedAgentId);
  const session = state.session.activeSession;
  const busy =
    session?.status === "streaming" || session?.status === "waiting_approval";
  const currentPending = !!(selectedAgentId && pending[selectedAgentId]);
  const enabledConfigs = agentConfigs.filter((c) => c.enabled !== false);
  useEffect(() => {
    if (reconnect && actionResult?.requestId === reconnect.id) {
      setReconnect(undefined);
      if (actionResult.success)
        invoke("CONNECT_AGENT", reconnect.agentId, true);
    }
  }, [actionResult]);
  const retry = (agentId: string) => {
    if (connections.some((c) => c.agentId === agentId)) {
      const id = invoke("DISCONNECT_AGENT", agentId);
      if (id) setReconnect({ id, agentId });
    } else invoke("CONNECT_AGENT", agentId);
  };
  useEffect(
    () =>
      tabs.current
        ?.querySelector<HTMLElement>('[aria-selected="true"]')
        ?.scrollIntoView?.({ block: "nearest", inline: "nearest" }),
    [selectedAgentId],
  );
  useLayoutEffect(() => {
    const el = budget.current;
    if (!el) return;
    const measure = () => {
      const nodes = Array.from(
        el.querySelectorAll<HTMLElement>("[data-measure-agent]"),
      );
      const widths = connections.map(
        (connection) =>
          nodes.find(
            (node) =>
              node.getAttribute("data-measure-agent") === connection.agentId,
          )?.offsetWidth ?? 0,
      );
      const container = el.clientWidth;
      setMetrics((previous) =>
        previous.container === container &&
        previous.widths.length === widths.length &&
        previous.widths.every((width, index) => width === widths[index])
          ? previous
          : { container, widths },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [connections, agentConfigs, selectedAgentId]);
  const select = (agentId: string) =>
    send({ type: "SELECT_AGENT", payload: { agentId } });
  const name = (id: string) =>
    agentConfigs.find((c) => c.id === id)?.name || id;
  const measured =
    metrics.container > 0 &&
    metrics.widths.length === connections.length &&
    metrics.widths.every((width) => width > 0);
  const packed = measured
    ? packAgentTabs(metrics.widths, metrics.container, MENU_WIDTH, TAB_GAP)
    : { visible: connections.map((_, index) => index), overflow: [] };
  const visible = packed.visible
    .map((index) => connections[index])
    .filter((connection) => connection);
  const overflow = packed.overflow
    .map((index) => connections[index])
    .filter((connection) => connection);
  const overflowKey = overflow
    .map((connection) => connection.agentId)
    .join("|");
  const rovingId = visible.some(
    (connection) => connection.agentId === selectedAgentId,
  )
    ? selectedAgentId
    : visible[0]?.agentId;
  useLayoutEffect(() => {
    const id = focusedAgent.current;
    if (!id || !overflow.some((connection) => connection.agentId === id))
      return;
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active.isConnected &&
      active.closest(`[role="tab"][data-measure-agent="${id}"]`)
    )
      return;
    summary.current?.focus();
    focusedAgent.current = undefined;
  }, [overflowKey]);
  const onTabKey = (event: TabKeyEvent, index: number) => {
    if ((event.target as HTMLElement).closest(".agent-tab-close")) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(visible[index].agentId);
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const last = visible.length - 1;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : event.key === "ArrowLeft"
            ? Math.max(0, index - 1)
            : Math.min(last, index + 1);
    if (next === index) return;
    select(visible[next].agentId);
    focusedAgent.current = visible[next].agentId;
    tabs.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  };
  const tab = (
    connection: (typeof connections)[number],
    interactive: boolean,
  ) => {
    const runtime = state.session.sessions.find(
      (item) => item.agentId === connection.agentId,
    );
    const badge =
      runtime?.status === "waiting_approval"
        ? "Approval"
        : runtime?.status === "streaming"
          ? "Working"
          : undefined;
    const index = visible.findIndex(
      (item) => item.agentId === connection.agentId,
    );
    return (
      <ConnectionTab
        key={connection.agentId}
        agentId={connection.agentId}
        label={name(connection.agentId)}
        status={connection.status}
        badge={badge}
        selected={connection.agentId === selectedAgentId}
        roving={connection.agentId === rovingId}
        interactive={interactive}
        pending={!!pending[connection.agentId]}
        onSelect={() => select(connection.agentId)}
        onDisconnect={() => invoke("DISCONNECT_AGENT", connection.agentId)}
        onKeyDown={(event) => onTabKey(event, index)}
        onFocus={() => {
          focusedAgent.current = connection.agentId;
        }}
      />
    );
  };
  return (
    <>
      <header ref={header} className="acp-header lifecycle-header">
        <div className="agent-header">
          <div ref={budget} className="agent-tab-budget header-left">
            <div
              ref={tabs}
              className="agent-tabs"
              role="tablist"
              aria-label="Connected Agents"
            >
              {visible.map((connection) => tab(connection, true))}
              {!connections.length && (
                <span className="empty-agent">Connect an Agent</span>
              )}
            </div>
            {overflow.length > 0 && (
              <details className="header-menu agent-overflow">
                <summary
                  ref={summary}
                  className="action-icon-btn"
                  aria-label="Agent overflow"
                  title="More Agents"
                >
                  <ActionIcon name="more" />
                </summary>
                <div className="menu-content">
                  {overflow.map((connection) => (
                    <div
                      className="agent-overflow-row"
                      key={connection.agentId}
                    >
                      <button
                        type="button"
                        aria-selected={connection.agentId === selectedAgentId}
                        onClick={() => select(connection.agentId)}
                      >{`${name(connection.agentId)} · ${connection.status}`}</button>
                      <button
                        type="button"
                        aria-label={`Disconnect ${name(connection.agentId)}`}
                        title={`Disconnect ${name(connection.agentId)}`}
                        disabled={!!pending[connection.agentId]}
                        onClick={() =>
                          invoke("DISCONNECT_AGENT", connection.agentId)
                        }
                      >
                        <ActionIcon name="close" />
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            )}
            <div className="agent-tab-measure" aria-hidden="true">
              {overflow.map((connection) => tab(connection, false))}
            </div>
          </div>
          <details className="header-menu connect-menu">
            <summary
              className="action-icon-btn"
              aria-label="Connect Agent"
              title="Connect Agent"
            >
              <ActionIcon name="connect" />
            </summary>
            <div className="menu-content">
              {enabledConfigs.map((c) => (
                <button
                  key={c.id}
                  disabled={
                    !!pending[c.id] ||
                    connections.some(
                      (connection) =>
                        connection.agentId === c.id &&
                        connection.status === "starting",
                    )
                  }
                  onClick={() => invoke("CONNECT_AGENT", c.id)}
                >
                  {c.name || c.id}
                </button>
              ))}
              {!enabledConfigs.length && (
                <button onClick={() => send({ type: "TOGGLE_CONFIG" })}>
                  Configure Agent
                </button>
              )}
            </div>
          </details>
          <button
            type="button"
            className="action-icon-btn"
            data-action="toggle-config"
            aria-label="Agent Settings"
            title="Agent Settings"
            onClick={() => send({ type: "TOGGLE_CONFIG" })}
          >
            <ActionIcon name="settings" />
          </button>
        </div>
        <div className="session-header">
          <div className="session-heading">
            <span>{session?.title || "No current Session"}</span>
            {session && <span className="badge">{session.status}</span>}
          </div>
          {current && (
            <button
              type="button"
              className="action-icon-btn"
              aria-label={`Connection information for ${name(current.agentId)}`}
              title={`Connection information for ${name(current.agentId)}`}
              onClick={() => setInfo(current.agentId)}
            >
              <ActionIcon name="info" />
            </button>
          )}
          <button
            type="button"
            className="action-icon-btn"
            data-action="new-session"
            aria-label="New Chat Session"
            title="New Chat Session"
            disabled={!current?.initialized || busy || currentPending}
            onClick={() =>
              selectedAgentId && invoke("CREATE_SESSION", selectedAgentId)
            }
          >
            <ActionIcon name="newChat" />
          </button>
          <button
            type="button"
            className="action-icon-btn"
            data-action="toggle-history"
            aria-label="Session History"
            title="Session History"
            disabled={!current?.initialized}
            onClick={() => send({ type: "TOGGLE_HISTORY" })}
          >
            <ActionIcon name="history" />
          </button>
          <button
            type="button"
            className="action-icon-btn"
            aria-label="Close current Session"
            title="Close current Session"
            disabled={!session || currentPending}
            onClick={() => session && invoke("CLOSE_SESSION", session.agentId)}
          >
            <ActionIcon name="close" />
          </button>
          <button
            type="button"
            className="action-icon-btn"
            data-action="show-output"
            aria-label="View ACP Output Channel Logs"
            title="View ACP Output Channel Logs"
            onClick={() => send({ type: "SHOW_OUTPUT" })}
          >
            <ActionIcon name="terminal" />
          </button>
        </div>
        {currentPending && (
          <div role="status" className="lifecycle-progress">
            Updating Agent / Session…
          </div>
        )}
        {actionResult &&
          !currentPending &&
          (actionResult.requestId === lastRequest ||
            actionResult.agentId === selectedAgentId) &&
          !actionResult.success && (
            <div role="alert" className="inline-error">
              {actionResult.error || "Action failed"}
            </div>
          )}
      </header>
      {info && (
        <ConnectionInfo
          agentId={info}
          onClose={() => setInfo(undefined)}
          onReconnect={() => retry(info)}
        />
      )}
    </>
  );
}
