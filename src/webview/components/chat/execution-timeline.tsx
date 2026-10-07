import { useEffect, useState } from "preact/hooks";
import type {
  AssistantTurn as TurnData,
  MessageChunk,
} from "../../../core/types/session";
import { ToolCallCard } from "./tool-call-card";
import { elapsed, executionTurns } from "./conversation-format";
import { ICONS } from "../icons";

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <span
      className="toggle-icon"
      dangerouslySetInnerHTML={{
        __html: expanded ? ICONS.chevronDown : ICONS.chevronRight,
      }}
    />
  );
}

function InternalTurn({
  turn,
  live,
  now,
}: {
  turn: TurnData;
  live: boolean;
  now: number;
}) {
  const [expandedOverride, setExpanded] = useState<boolean>();
  const expanded = expandedOverride ?? live;
  const thinking = turn.thinking?.trim()
    ? turn.thinking
    : "Thinking unavailable";
  return (
    <div
      className={`internal-turn-card thinking-card ${expanded ? "expanded" : ""}`}
    >
      <button
        type="button"
        className="internal-turn-header thinking-header"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <Chevron expanded={expanded} />
        <span className="turn-call-count">
          {turn.toolCalls.length}{" "}
          {turn.toolCalls.length === 1 ? "call" : "calls"}
        </span>
        <span className="turn-thinking-preview" title={thinking}>
          {thinking}
        </span>
        <span className="elapsed-time">
          {elapsed(
            live || turn.completedAt !== undefined ? turn.startedAt : undefined,
            turn.completedAt,
            now,
          )}
        </span>
      </button>
      <div className="internal-turn-body">
        {turn.toolCalls.map((tool) => (
          <ToolCallCard key={tool.id} toolCall={tool} now={now} />
        ))}
      </div>
    </div>
  );
}

export function ExecutionTimeline({
  message,
  isStreaming,
}: {
  message: Pick<
    MessageChunk,
    "turns" | "thinking" | "toolCalls" | "startedAt" | "completedAt"
  > & { content?: string };
  isStreaming: boolean;
}) {
  const turns = executionTurns(message);
  const working =
    isStreaming && !message.content && message.completedAt === undefined;
  const [expandedOverride, setExpanded] = useState<boolean>();
  const expanded = expandedOverride ?? isStreaming;
  const [now, setNow] = useState(Date.now);
  const ticking =
    isStreaming &&
    (working ||
      turns.some((turn) =>
        turn.toolCalls.some(
          (tool) =>
            tool.startedAt !== undefined &&
            tool.completedAt === undefined &&
            ["pending", "running"].includes(tool.status),
        ),
      ));
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [ticking]);
  if (!turns.length) return null;
  const count = turns.reduce((total, turn) => total + turn.toolCalls.length, 0);
  const duration = elapsed(
    working || message.completedAt !== undefined
      ? message.startedAt
      : undefined,
    message.completedAt,
    now,
  );
  const summary = [
    working ? "Working" : "Worked",
    duration,
    `${turns.length} turns`,
    `${count} calls`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={`execution-steps-card ${expanded ? "expanded" : ""}`}>
      <button
        type="button"
        className="execution-card-header"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <Chevron expanded={expanded} />
        <span className="execution-card-title">{summary}</span>
      </button>
      <div className="execution-steps-body">
        {turns.map((turn, index) => (
          <InternalTurn
            key={index}
            turn={turn}
            live={working && index === turns.length - 1}
            now={now}
          />
        ))}
      </div>
    </div>
  );
}
