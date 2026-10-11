import { ICONS } from "../icons";

export type ChatLoadingMode = "connecting" | "session" | "updating";

export function ChatLoadingOverlay({
  mode,
  agentName,
}: {
  mode: ChatLoadingMode;
  agentName?: string;
}) {
  const title =
    mode === "connecting"
      ? `Connecting to Agent${agentName ? ` (${agentName})` : ""}…`
      : mode === "session"
      ? "Initializing Session…"
      : "Updating Agent / Session…";

  const subtitle =
    mode === "connecting"
      ? "Establishing protocol handshake and starting agent process…"
      : mode === "session"
      ? "Preparing workspace context and configuring session parameters…"
      : "Synchronizing agent lifecycle state…";

  return (
    <div className="chat-loading-overlay" role="status" aria-live="polite">
      <div className="chat-loading-card">
        <div className="chat-loading-spinner-box">
          <div className="chat-loading-spinner" />
          <div
            className="chat-loading-glow-icon"
            dangerouslySetInnerHTML={{ __html: ICONS.bolt }}
          />
        </div>
        <div className="chat-loading-text-group">
          <div className="chat-loading-title">{title}</div>
          <div className="chat-loading-subtitle">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}
