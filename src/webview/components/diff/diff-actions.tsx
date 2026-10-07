export function DiffActions({
  onApply,
  onOpenEditor,
  onDismiss,
}: {
  onApply: () => void;
  onOpenEditor: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="diff-actions-bar">
      <button
        type="button"
        className="btn btn-primary btn-apply-diff"
        onClick={onApply}
        title="Apply Diff to Workspace"
      >
        Apply Diff
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-open-diff"
        onClick={onOpenEditor}
        title="Open Side-by-Side in VS Code Diff Editor"
      >
        Open Diff Editor
      </button>
      {onDismiss && (
        <button
          type="button"
          className="btn btn-icon btn-dismiss-diff"
          onClick={onDismiss}
          title="Dismiss Diff"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
