export interface PermissionRequestProps {
  sessionId?: string;
  requestId: string;
  toolTitle: string;
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
