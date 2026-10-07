import { useEffect, useRef } from "preact/hooks";

export function PromptTextarea({
  value,
  onChange,
  onKeyDown,
  onPaste,
  disabled,
  placeholder = "Ask a question, request changes, or type / for commands...",
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onPaste?: (e: ClipboardEvent) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(Math.max(el.scrollHeight, 56), 240);
    el.style.height = `${newHeight}px`;
  }, [value]);

  const handleInput = (e: any) => {
    const val = e?.target?.value ?? e?.currentTarget?.value ?? "";
    onChange(val);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    const editingShortcut =
      (e.ctrlKey || e.metaKey) &&
      !e.altKey &&
      !e.isComposing &&
      e.keyCode !== 229 &&
      (key === "z" || (key === "y" && e.ctrlKey && !e.shiftKey));
    if (editingShortcut) {
      // Keep editing commands inside the Webview and use Chromium's native
      // history so typing, paste, selection and IME edits retain their semantics.
      e.preventDefault();
      e.stopPropagation();
      const command = key === "y" || e.shiftKey ? "redo" : "undo";
      ref.current?.ownerDocument.execCommand(command);
      return;
    }
    onKeyDown(e);
  };

  return (
    <textarea
      ref={ref}
      className="prompt-textarea prompt-input"
      value={value}
      style={{ overflowY: "auto" }}
      onInput={handleInput}
      onChange={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={onPaste}
      disabled={disabled}
      placeholder={placeholder}
      rows={1}
      aria-label="User prompt input"
    />
  );
}
