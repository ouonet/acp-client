import type { ProcessStatus } from "../../../core/ports";

export function AgentStatusDot({ status }: { status?: ProcessStatus }) {
  const normalized = status || "stopped";
  return (
    <span
      className={`status-dot ${normalized}`}
      title={`Agent status: ${normalized}`}
      aria-label={`Agent status: ${normalized}`}
    />
  );
}
