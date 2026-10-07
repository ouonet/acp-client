import type { ContentBlock, MessageChunk } from "../../../core/types/session";
import { ExecutionTimeline } from "./execution-timeline";
import { MarkdownBody } from "./markdown-body";
import { ActionIcon } from "../action-icon";
import { contentText, copyText, executionTurns } from "./conversation-format";

export interface AssistantMessageProps extends Partial<
  Omit<MessageChunk, "role" | "content">
> {
  content?: string | ContentBlock[];
  timestamp?: number;
}

export function AssistantTurn({
  message,
  isStreaming = false,
  agentName,
  onFork,
  forkDisabledReason,
}: {
  message: AssistantMessageProps;
  isStreaming?: boolean;
  agentName?: string;
  model?: string;
  onFork?: () => void;
  forkDisabledReason?: string;
}) {
  const content = contentText(message.content);
  const responseAt =
    message.completedAt ?? message.timestamp ?? message.startedAt;
  const responseDate =
    responseAt !== undefined ? new Date(responseAt) : undefined;
  const responseTime =
    responseDate && Number.isFinite(responseDate.getTime())
      ? responseDate.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        })
      : undefined;
  const copyAll = () => {
    const execution = executionTurns(message)
      .map((turn) =>
        [
          turn.thinking,
          ...turn.toolCalls.map((tool) =>
            [
              tool.name,
              JSON.stringify(tool.input, null, 2),
              JSON.stringify(tool.output, null, 2),
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n\n");
    copyText([execution, content].filter(Boolean).join("\n\n"));
  };
  return (
    <div
      className={`chat-turn assistant-turn message-row assistant ${isStreaming ? "streaming-turn" : ""}`}
    >
      <div className="assistant-content message-content">
        <ExecutionTimeline
          message={{ ...message, content }}
          isStreaming={isStreaming}
        />
        {content ? (
          <MarkdownBody content={content} isStreaming={isStreaming} />
        ) : isStreaming ? (
          <div className="streaming-cursor">Thinking...</div>
        ) : null}
      </div>
      <div className="assistant-message-actions">
        <div className="turn-header-left">
          {agentName && (
            <span className="role-badge assistant-badge">{agentName}</span>
          )}
          {responseTime && (
            <span
              className="turn-timestamp"
              title={responseDate?.toLocaleString()}
            >
              {responseTime}
            </span>
          )}
        </div>
        <div className="turn-header-actions">
          <button
            type="button"
            className="turn-action-btn action-icon-btn"
            title="Copy all"
            aria-label="Copy all"
            onClick={copyAll}
          >
            <ActionIcon name="copy" />
          </button>
          {onFork && !isStreaming && (
            <button
              type="button"
              className="turn-action-btn action-icon-btn"
              data-action="fork-message"
              title={forkDisabledReason || "Fork from here"}
              aria-label="Fork from here"
              disabled={!!forkDisabledReason}
              onClick={onFork}
            >
              <ActionIcon name="fork" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
