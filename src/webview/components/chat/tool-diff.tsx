import { useAction } from "../../state/action-context";

/** Partial patches are preview-only; applying requires both complete file snapshots. */
export function ToolDiff({ input }: { input: unknown }) {
  const sendAction = useAction();
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const diff = value.diff ?? value.patch;
  if (typeof diff !== "string" || !diff) return null;
  const filePath = typeof value.filePath === "string" ? value.filePath : typeof value.path === "string" ? value.path : "diff";
  const originalContent = value.originalContent;
  const modifiedContent = value.modifiedContent ?? value.content;
  const canApply = typeof originalContent === "string" && typeof modifiedContent === "string";
  return (
    <div className="tool-diff-container">
      <div className="tool-diff-header"><span className="tool-preview">{filePath}</span>
        {canApply && <>
          <button type="button" className="turn-action-btn" title="Open diff in editor" onClick={() => sendAction({ type: "OPEN_DIFF_EDITOR", payload: { filePath, originalContent, modifiedContent } })}>Open diff</button>
          <button type="button" className="turn-action-btn" title="Apply diff" onClick={() => sendAction({ type: "APPLY_FILE_DIFF", payload: { filePath, originalContent, content: modifiedContent } })}>Apply</button>
        </>}
      </div>
      <pre className="tool-code">{diff}</pre>
    </div>
  );
}
