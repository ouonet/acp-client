import { useState } from "preact/hooks";
import type { ToolCall } from "../../../core/types/session";
import { elapsed, formatToolValue, toolPreview } from "./conversation-format";
import { ToolDiff } from "./tool-diff";
import { ICONS } from "../icons";

export interface ToolCallItem extends Partial<Omit<ToolCall, "id" | "status">> {
  id: string;
  title?: string;
  status?: ToolCall["status"] | "error";
}

export function ToolCallCard({ toolCall, now }: { toolCall: ToolCallItem; now?: number }) {
  const [expanded, setExpanded] = useState(false);
  const status = toolCall.status || "pending";
  const name = toolCall.name || toolCall.title || toolCall.id;
  const input = formatToolValue(toolCall.input);
  const output = formatToolValue(toolCall.output);
  return (
    <div className={`tool-call-card ${status} ${expanded ? "expanded" : ""}`} data-tool-id={toolCall.id}>
      <button type="button" className="tool-call-header" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        <span className="tool-header-left">
          <span className="tool-chevron" dangerouslySetInnerHTML={{ __html: expanded ? ICONS.chevronDown : ICONS.chevronRight }} />
          <span className="tool-icon" dangerouslySetInnerHTML={{ __html: ICONS.tool }} />
          <span className="tool-name" title={name}>{name}</span>
          {input && <span className="tool-preview tool-input-preview" title={input}>{toolPreview(toolCall.input)}</span>}
          {output && <span className="tool-preview tool-output-preview" title={output}>{toolPreview(toolCall.output)}</span>}
        </span>
        <span className="elapsed-time">{elapsed(toolCall.completedAt !== undefined || ["pending", "running"].includes(status) ? toolCall.startedAt : undefined, toolCall.completedAt, now)}</span>
        {status !== "completed" && <span className={`badge tool-badge badge-${status}`}>{status}</span>}
      </button>
      {expanded && <div className="tool-call-body">
        <ToolDiff input={toolCall.input} />
        {input && <div className="tool-section"><span className="tool-section-label">Input Parameters</span><pre className="tool-code">{input}</pre></div>}
        {output && <div className="tool-section"><span className="tool-section-label">Result</span><pre className="tool-code">{output}</pre></div>}
      </div>}
    </div>
  );
}
