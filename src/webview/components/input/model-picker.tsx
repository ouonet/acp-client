import { useEffect, useRef, useState } from "preact/hooks";
import type { ThinkingLevel } from "../../../core/types/session";

export function ModelPicker({
  selectedModel,
  availableModels,
  thinkingLevel,
  availableThinkingLevels,
  disabled = false,
  onModelChange,
  onThinkingLevelChange,
}: {
  selectedModel?: string;
  availableModels: string[];
  thinkingLevel?: ThinkingLevel;
  availableThinkingLevels: string[];
  disabled?: boolean;
  onModelChange: (model: string) => void;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const options = [
    ...availableModels.map((value) => ({ kind: "model", value })),
    ...(selectedModel || availableModels.length === 0
      ? availableThinkingLevels.map((value) => ({ kind: "level", value }))
      : []),
  ];
  useEffect(() => {
    if (!open || disabled) return;
    root.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus();
  }, [open, disabled]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  if (options.length === 0 && !disabled) return null;
  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };
  const choose = (kind: string, value: string) => {
    if (disabled) return;
    if (kind === "model") {
      if (value !== selectedModel) onModelChange(value);
    } else {
      if (value !== thinkingLevel) onThinkingLevelChange(value);
      close();
    }
  };
  return (
    <div className="model-picker-bar toolbar-left combined-picker" ref={root}>
      <button
        type="button"
        ref={toggle}
        className="model-picker-toggle"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Select model and thinking level"
        disabled={disabled}
        onClick={() => {
          setFocusIndex(0);
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            close();
          }
          if (event.key === "ArrowDown" || event.key === "Enter") {
            event.preventDefault();
            setOpen(true);
            setFocusIndex(0);
          }
        }}
      >
        {selectedModel ||
          (availableModels.length ? "Select model" : "Thinking")}
        {thinkingLevel ? ` · ${thinkingLevel}` : ""}{" "}
        <span aria-hidden="true">⌄</span>
      </button>
      {open && !disabled && (
        <div
          role="menu"
          className="model-picker-menu"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const next =
                (focusIndex +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  options.length) %
                options.length;
              setFocusIndex(next);
              root.current
                ?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
                [next]?.focus();
            }
          }}
        >
          {availableModels.map((model, index) => (
            <button
              type="button"
              role="menuitem"
              key={model}
              data-model={model}
              className={model === selectedModel ? "active" : ""}
              onFocus={() => setFocusIndex(index)}
              onClick={() => choose("model", model)}
            >
              {model === selectedModel ? "✓ " : ""}
              {model}
            </button>
          ))}
          {availableThinkingLevels.length > 0 &&
            (selectedModel || availableModels.length === 0) && (
              <div className="model-picker-levels" aria-label="Thinking levels">
                {availableThinkingLevels.map((level, index) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={level}
                    data-level={level}
                    className={level === thinkingLevel ? "active" : ""}
                    onFocus={() =>
                      setFocusIndex(availableModels.length + index)
                    }
                    onClick={() => choose("level", level)}
                  >
                    {level === thinkingLevel ? "✓ " : ""}
                    {level}
                  </button>
                ))}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
