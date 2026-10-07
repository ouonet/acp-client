import { useState } from "preact/hooks";
import { ICONS } from "../icons";

export function ThinkingCard({
  thinking,
  durationSeconds,
  defaultExpanded = false,
}: {
  thinking: string;
  durationSeconds?: number;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!thinking) return null;

  return (
    <div className={`thinking-card ${expanded ? "expanded" : ""}`}>
      <button
        type="button"
        className="thinking-header"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span
          className="thinking-chevron"
          dangerouslySetInnerHTML={{ __html: expanded ? ICONS.chevronDown : ICONS.chevronRight }}
        />
        <span className="thinking-icon" dangerouslySetInnerHTML={{ __html: ICONS.brain }} />
        <span className="thinking-title">
          Thinking{durationSeconds !== undefined ? ` (${durationSeconds.toFixed(1)}s)` : ""}
        </span>
      </button>

      {expanded && (
        <div className="thinking-body">
          <pre className="thinking-pre">{thinking}</pre>
        </div>
      )}
    </div>
  );
}

