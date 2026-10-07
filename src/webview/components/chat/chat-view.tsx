import { useEffect, useRef } from "preact/hooks";
import { useAppStore } from "../../state/store-context";
import { useAction } from "../../state/action-context";
import { UserBubble } from "./user-bubble";
import { AssistantTurn } from "./assistant-turn";
import { PermissionGate } from "./permission-gate";
import { ICONS } from "../icons";
import { useMessageActions } from "../../state/use-message-actions";
import { useLifecycleActions } from "../../state/use-lifecycle-actions";
import { canRestorePrompt } from "./message-prompt";

export function ChatView() {
  const [state, dispatch] = useAppStore();
  const sendAction = useAction();
  const messageActions = useMessageActions();
  const lifecycle = useLifecycleActions();
  const invoke = useRef(lifecycle.invoke);
  invoke.current = lifecycle.invoke;
  const remembered = useRef(new Set<string>());
  const boundSession = useRef<{ sessionId: string; generation: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { activeSession, streamingText, streamingThinking, pendingPermission } = state.session;
  const messages = activeSession?.messages || [];
  const isStreaming = activeSession?.status === "streaming" || !!streamingText || !!streamingThinking;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streamingText, streamingThinking, pendingPermission]);

  const handlePermissionRespond = (
    decision: "allow" | "deny" | "always_allow_session",
    optionId?: string,
  ) => {
    if (!pendingPermission) return;
    const connection = state.agent.connections?.find(c => c.agentId === activeSession?.agentId);
    const target = connection ? { agentId: activeSession?.agentId, generation: connection.generation, runtimeRevision: activeSession?.runtimeRevision } : {};
    sendAction({
      type: "RESPOND_PERMISSION",
      payload: {
        sessionId: pendingPermission.sessionId || activeSession?.id || "",
        ...target,
        requestId: pendingPermission.requestId,
        decision,
        optionId,
      },
    });
    dispatch({ type: "PERMISSION_RESOLVED" });
  };

  const { agentConfigs, selectedAgentId } = state.agent;
  const currentAgentId = selectedAgentId || agentConfigs[0]?.id;
  const loaded = Array.isArray(state.agent.connections);
  const connection = state.agent.connections?.find((item) => item.agentId === currentAgentId);
  const connected = !!connection?.initialized;
  const selectedInConfigs = !!currentAgentId && agentConfigs.some((item) => item.id === currentAgentId);
  const pendingCount = Object.keys(state.agent.lifecyclePending || {}).length;

  useEffect(() => {
    if (!loaded || !currentAgentId) return;
    if (activeSession && connected && activeSession.agentId === currentAgentId && connection) {
      const sameSession = boundSession.current?.sessionId === activeSession.id;
      const sameGeneration = boundSession.current?.generation === connection.generation;
      if (!sameSession) {
        boundSession.current = { sessionId: activeSession.id, generation: connection.generation };
        remembered.current.add(`${currentAgentId}:${connection.generation}`);
      } else if (sameGeneration) {
        remembered.current.add(`${currentAgentId}:${connection.generation}`);
      }
      return;
    }
    if (!activeSession) boundSession.current = null;
    if (activeSession || !connected || !selectedInConfigs || !connection || pendingCount > 0) return;
    const key = `${currentAgentId}:${connection.generation}`;
    if (remembered.current.has(key)) return;
    const requestId = invoke.current("CREATE_SESSION", currentAgentId);
    if (requestId) remembered.current.add(key);
  }, [loaded, currentAgentId, activeSession, connected, connection, selectedInConfigs, pendingCount]);

  const mode = !loaded ? "hidden"
    : activeSession ? "session"
    : agentConfigs.length === 0 ? "create-config"
    : connected ? "create-session"
    : "connect";
  const title = mode === "session" ? activeSession?.title || "Current Session"
    : mode === "create-config" ? "Create an Agent"
    : mode === "create-session" ? "Create a Session"
    : "Connect an ACP Agent";
  const subtitle = mode === "session"
    ? activeSession?.attached === false
      ? "Reconnect the Agent or create a new Session to continue."
      : "Send a prompt to begin this conversation."
    : mode === "create-config" ? "Add an Agent configuration to begin."
    : mode === "create-session" ? "Start a new Session or load one from Agent history."
    : "Select an Agent from your configurations to establish an interactive pair-programming session.";

  return (
    <main ref={containerRef} className="chat-view chat-scroll-area" aria-label="Conversation messages">
      {messages.length === 0 && !isStreaming && mode !== "hidden" && (
        <div className="chat-welcome-container empty-chat-state">
          <div className="welcome-card">
            <div className="welcome-icon-glow" dangerouslySetInnerHTML={{ __html: ICONS.bolt }} />
            <h2 className="welcome-title">{title}</h2>
            <p className="welcome-subtitle">{subtitle}</p>
            {mode === "create-config" && (
              <div className="welcome-actions-row">
                <button type="button" className="btn-welcome-connect" onClick={() => sendAction({ type: "TOGGLE_CONFIG" })}>
                  <span dangerouslySetInnerHTML={{ __html: ICONS.bolt }} />
                  <span>Create Agent</span>
                </button>
              </div>
            )}
            {(mode === "connect" || mode === "create-session") && (
              <div className="welcome-actions-row">
                <div className="welcome-select-wrapper">
                  <select
                    className="welcome-agent-select"
                    value={currentAgentId}
                    onChange={(e) => dispatch({ type: "SELECT_AGENT", payload: (e.target as HTMLSelectElement).value })}
                  >
                    {agentConfigs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.id}
                      </option>
                    ))}
                  </select>
                  <span className="select-chevron" dangerouslySetInnerHTML={{ __html: ICONS.chevronDown }} />
                </div>
                <button
                  type="button"
                  className="btn-welcome-connect"
                  onClick={() => currentAgentId && invoke.current(mode === "connect" ? "CONNECT_AGENT" : "CREATE_SESSION", currentAgentId)}
                >
                  <span dangerouslySetInnerHTML={{ __html: ICONS.bolt }} />
                  <span>{mode === "connect" ? "Connect Agent" : "New Session"}</span>
                </button>
              </div>
            )}
            <div className="welcome-hints" style={{ marginTop: "12px", fontSize: "11px", color: "var(--fg-muted)" }}>
              <span>Press <code>/</code> for skills and commands (/tdd, /review, /design, /plan)</span>
            </div>
          </div>
        </div>
      )}

      {messageActions.feedback && <div className="message-action-feedback" role="status">{messageActions.feedback}</div>}
      {messages.map((msg: any, idx: number) => {
        if (msg.role === "user") {
          return <UserBubble key={idx} content={msg.content} timestamp={msg.timestamp}
            onRewind={() => messageActions.invoke("rewind", idx)} disabledReason={messageActions.disabledReason}
            rewindDisabledReason={canRestorePrompt(msg.content) ? undefined : "Rewind supports text and images only"} />;
        }
        const isCurrentStreaming = isStreaming && idx === messages.length - 1;
        return <AssistantTurn key={idx} message={msg} isStreaming={isCurrentStreaming}
          agentName={agentConfigs.find(config => config.id === activeSession?.agentId)?.name}
          model={activeSession?.model}
          onFork={msg.role === "assistant" ? () => messageActions.invoke("fork", idx) : undefined}
          forkDisabledReason={messageActions.disabledReason}
        />;
      })}

      {isStreaming && (!messages.length || messages[messages.length - 1].role !== "assistant") && (
        <AssistantTurn
          isStreaming={true}
          message={{
            content: streamingText,
            thinking: streamingThinking,
          }}
        />
      )}

      {pendingPermission && (
        <PermissionGate
          request={pendingPermission}
          onRespond={handlePermissionRespond}
        />
      )}
    </main>
  );
}
