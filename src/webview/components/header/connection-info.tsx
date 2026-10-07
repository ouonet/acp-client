import { useAppStore } from "../../state/store-context";
import { ModalDrawer } from "../drawers/modal-drawer";

export function ConnectionInfo({ agentId, onClose, onReconnect }: { agentId: string; onClose: () => void; onReconnect: () => void }) {
  const [state] = useAppStore();
  const connection = state.agent.connections?.find(c => c.agentId === agentId);
  const caps = connection?.capabilities || {};
  const clientCaps = connection?.clientCapabilities;
  const sessionCaps = caps.sessionCapabilities || caps.loadSession !== undefined
    ? { ...caps.sessionCapabilities, ...(caps.loadSession !== undefined ? { loadSession: caps.loadSession } : {}) }
    : undefined;
  const groups = [
    ["Session and history", sessionCaps],
    ["Prompt content", caps.promptCapabilities],
    ["MCP", caps.mcpCapabilities],
  ];
  return <ModalDrawer label="Agent connection information" className="connection-info" onClose={onClose}>
      <div className="drawer-header"><h2>Connection information</h2><button aria-label="Close connection information" onClick={onClose}>×</button></div>
      <div className="drawer-body">
        <dl><dt>Agent</dt><dd>{connection?.agentInfo?.title || connection?.agentInfo?.name || state.agent.agentConfigs.find(c => c.id === agentId)?.name || agentId}</dd>
          <dt>Version</dt><dd>{connection?.agentInfo?.version || "Not reported"}</dd><dt>Protocol</dt><dd>{connection?.protocolVersion ?? "Not reported"}</dd><dt>Status</dt><dd>{connection?.status || "Disconnected"}</dd></dl>
        {connection?.error && <p role="alert">{connection.error}</p>}
        {state.agent.actionResult?.agentId === agentId && !state.agent.actionResult.success && <p role="alert">{state.agent.actionResult.error}</p>}
        <h3>Agent-reported capabilities</h3>
        {groups.map(([label, values]) => <section key={label as string}><h4>{label}</h4>
          {label === "Prompt content" && <p>Text and resource links are baseline ACP content. Optional image, audio and embedded content declarations:</p>}
          <pre>{values ? JSON.stringify(values, null, 2) : "Not reported"}</pre></section>)}
        <h3>Client-offered capabilities</h3>
        {clientCaps ? <>
          <p>Read text files: {clientCaps.fs?.readTextFile === true ? "offered" : "not offered"}. Write text files: {clientCaps.fs?.writeTextFile === true ? "offered" : "not offered"}. Terminal: {clientCaps.terminal === true ? "offered" : "not offered"}.</p>
          <details><summary>Raw Client declaration</summary><pre data-client-capabilities>{JSON.stringify(clientCaps, null, 2)}</pre></details>
        </> : <p>Client capabilities unavailable. Reconnect to obtain the handshake declaration.</p>}
        <details><summary>Raw Agent declaration</summary><pre>{JSON.stringify(caps, null, 2)}</pre></details>
        <button onClick={onReconnect}>Reconnect / retry</button>
      </div>
  </ModalDrawer>;
}
