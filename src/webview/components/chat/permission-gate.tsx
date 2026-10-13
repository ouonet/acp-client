import { formatToolValue } from "./conversation-format";

export interface PermissionRequestProps {
  sessionId?: string;
  requestId: string;
  toolTitle: string;
  toolName?: string;
  toolKind?: string;
  toolCallId?: string;
  toolInput?: unknown;
  toolContent?: unknown;
  toolLocations?: unknown;
  options?: readonly { optionId: string; name: string; kind: string }[];
}

export function PermissionGate({
  request,
  onRespond,
}: {
  request: PermissionRequestProps;
  onRespond: (decision: "allow" | "deny" | "always_allow_session", optionId?: string) => void;
}) {
  const options = request.options || [
    { optionId: "allow", name: "Allow", kind: "allow" },
    { optionId: "deny", name: "Deny", kind: "deny" },
  ];

  const handleDecision = (opt: { optionId: string; kind: string }) => {
    let decision: "allow" | "deny" | "always_allow_session" = "allow";
    if (opt.kind === "deny") decision = "deny";
    else if (opt.kind === "always" || opt.kind === "always_allow_session") decision = "always_allow_session";
    onRespond(decision, opt.optionId);
  };

  const paramsText = formatToolValue(request.toolInput);
  const locationsText = formatToolValue(request.toolLocations);
  const contentText = formatToolValue(request.toolContent);
  const showName = request.toolName && request.toolName !== request.toolTitle;

  return (
    <div className="permission-gate card" role="alertdialog" aria-label="Permission Request">
      <div className="permission-header">
        <span className="permission-icon">🛡️</span>
        <span className="permission-heading">Permission Requested</span>
      </div>

      <div className="permission-body">
        <p className="permission-desc">The agent requires approval to execute:</p>
        <div className="permission-command">
          <code>{request.toolTitle}</code>
        </div>
        {showName && (
          <div className="permission-meta">
            <code>{request.toolName}</code>
            {request.toolKind && <span className="badge">{request.toolKind}</span>}
          </div>
        )}
        {!showName && request.toolKind && (
          <div className="permission-meta">
            <span className="badge">{request.toolKind}</span>
          </div>
        )}
        {paramsText && (
          <div className="permission-params">
            <span className="tool-section-label">Parameters</span>
            <pre className="tool-code">{paramsText}</pre>
          </div>
        )}
        {locationsText && (
          <div className="permission-params">
            <span className="tool-section-label">Locations</span>
            <pre className="tool-code">{locationsText}</pre>
          </div>
        )}
        {contentText && (
          <div className="permission-params">
            <span className="tool-section-label">Content</span>
            <pre className="tool-code">{contentText}</pre>
          </div>
        )}
      </div>

      <div className="permission-actions">
        {options.map((opt) => (
          <button
            key={opt.optionId}
            type="button"
            className={`btn ${opt.kind === "deny" ? "btn-danger" : "btn-primary"}`}
            data-decision={opt.kind}
            onClick={() => handleDecision(opt)}
          >
            {opt.name}
          </button>
        ))}
      </div>
    </div>
  );
}
