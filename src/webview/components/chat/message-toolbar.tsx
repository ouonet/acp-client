import { ActionIcon } from "../action-icon";

export interface MessageToolbarProps {
  onCopy: () => void;
  onRewind?: () => void;
  disabledReason?: string;
  rewindDisabledReason?: string;
}

export function MessageToolbar({ onCopy, onRewind, disabledReason, rewindDisabledReason }: MessageToolbarProps) {
  const rewindReason = disabledReason || rewindDisabledReason;
  return (
    <div className="message-toolbar" role="toolbar" aria-label="Message actions">
      <button type="button" className="turn-action-btn action-icon-btn" data-action="copy-message" title="Copy prompt" aria-label="Copy prompt" onClick={onCopy}><ActionIcon name="copy" /></button>
      <button type="button" className="turn-action-btn action-icon-btn" data-action="rewind-message" title={rewindReason || "Rewind / Undo"} aria-label="Rewind / Undo" disabled={!onRewind || !!rewindReason} onClick={onRewind}><ActionIcon name="rewind" /></button>
    </div>
  );
}
