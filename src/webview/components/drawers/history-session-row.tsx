import { useEffect, useRef, useState } from "preact/hooks";
import { ICONS } from "../icons";
import type { HistorySession } from "../../state/use-history-page";

interface Props {
  session: HistorySession;
  currentStatus?: string;
  loadReason?: string;
  deleteReason?: string;
  confirming: boolean;
  deleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function HistorySessionRow(props: Props) {
  const { session, currentStatus, loadReason, deleteReason, confirming, deleting } = props;
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const alive = useRef(true);
  const sequence = useRef(0);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const copy = async () => {
    const attempt = ++sequence.current;
    setFeedback(undefined);
    try {
      await navigator.clipboard.writeText(session.id);
      if (alive.current && attempt === sequence.current) setFeedback({ text: "Session ID copied" });
    } catch (error) {
      if (alive.current && attempt === sequence.current)
        setFeedback({
          text: `Unable to copy Session ID: ${error instanceof Error ? error.message : String(error)}`,
          error: true,
        });
    }
  };
  const title = session.title || "Untitled Session";
  const date = session.updatedAt ? new Date(session.updatedAt) : undefined;
  const time = date && Number.isFinite(date.getTime()) ? date.toLocaleString() : "Last activity not reported";
  return (
    <div className={`history-session-row${currentStatus ? " current" : ""}`} data-session-id={session.id}>
      <div className="history-session-summary">
        <button
          type="button"
          className="session-item"
          disabled={!!loadReason}
          title={loadReason || `Load Session: ${session.id}`}
          onClick={props.onOpen}
        >
          <span className="session-heading-line">
            <span className="session-title" title={title}>
              {title}
            </span>
            {currentStatus && (
              <span className="session-current" title={`Current · ${currentStatus}`}>
                Current · {currentStatus}
              </span>
            )}
          </span>
          <span className="session-meta">
            <span className="session-time" title={time}>
              {time}
            </span>
            {session.cwd && (
              <span className="session-cwd" title={session.cwd}>
                {session.cwd}
              </span>
            )}
          </span>
        </button>
        <div className="session-actions">
          <button type="button" aria-label="Copy Session ID" title={`Copy Session ID: ${session.id}`} onClick={copy}>
            <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS.copy }} />
          </button>
          <button
            type="button"
            className="session-delete"
            aria-label="Delete Session"
            title={deleteReason || "Delete Session"}
            disabled={!!deleteReason}
            onClick={props.onDelete}
          >
            <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS.trash }} />
          </button>
        </div>
      </div>
      {feedback && (
        <div className="session-feedback" role={feedback.error ? "alert" : "status"}>
          {feedback.text}
        </div>
      )}
      {confirming && (
        <div className="session-delete-confirm">
          <span>
            Permanently delete <strong>{title}</strong> from this Agent?{" "}
            <span className="session-confirm-id">{session.id}</span>
          </span>
          <div className="session-confirm-actions">
            <button type="button" aria-label="Cancel delete Session" disabled={deleting} onClick={props.onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="session-delete"
              aria-label="Confirm delete Session"
              disabled={!!deleteReason}
              onClick={props.onConfirm}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
