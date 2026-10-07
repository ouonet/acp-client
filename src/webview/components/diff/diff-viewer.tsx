import { useAction } from "../../state/action-context";
import { DiffActions } from "./diff-actions";

export interface DiffViewerProps {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  diffText?: string;
  onClose?: () => void;
}

export function DiffViewer({
  filePath,
  originalContent,
  modifiedContent,
  diffText,
  onClose,
}: DiffViewerProps) {
  const sendAction = useAction();

  const handleApply = () => {
    sendAction({
      type: "APPLY_FILE_DIFF",
      payload: { filePath, originalContent, content: modifiedContent },
    });
  };

  const handleOpenEditor = () => {
    sendAction({
      type: "OPEN_DIFF_EDITOR",
      payload: { filePath, originalContent, modifiedContent },
    });
  };

  // Generate simple diff lines if diffText not provided
  const lines = (diffText || "").split("\n");

  return (
    <div className="diff-viewer card" role="region" aria-label={`Diff for ${filePath}`}>
      <div className="diff-viewer-header">
        <div className="diff-file-info">
          <span className="diff-file-icon">📝</span>
          <span className="diff-file-path font-mono">{filePath}</span>
        </div>
        <DiffActions
          onApply={handleApply}
          onOpenEditor={handleOpenEditor}
          onDismiss={onClose}
        />
      </div>

      <div className="diff-viewer-body">
        {lines.length > 0 ? (
          <pre className="diff-content font-mono">
            {lines.map((line, idx) => {
              let lineClass = "diff-line-context";
              if (line.startsWith("+")) lineClass = "diff-line-add";
              else if (line.startsWith("-")) lineClass = "diff-line-del";
              else if (line.startsWith("@@")) lineClass = "diff-line-hunk";
              return (
                <div key={idx} className={`diff-line ${lineClass}`}>
                  {line}
                </div>
              );
            })}
          </pre>
        ) : (
          <div className="diff-summary">
            Original: {originalContent.length} bytes, Modified: {modifiedContent.length} bytes
          </div>
        )}
      </div>
    </div>
  );
}
