import { useEffect, useRef, useState } from "preact/hooks";
import { ICONS } from "../icons";

export interface ModePickerProps {
  currentModeId?: string;
  availableModes?: Array<{ id: string; name: string; description?: string }>;
  disabled?: boolean;
  onModeChange: (modeId: string) => void;
}

export function ModePicker({
  currentModeId,
  availableModes,
  disabled = false,
  onModeChange,
}: ModePickerProps) {
  if (!availableModes || availableModes.length === 0) {
    return null;
  }

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeMode = availableModes.find((m) => m.id === currentModeId) ?? availableModes[0];
  const activeId = activeMode?.id ?? currentModeId;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="mode-picker-container" ref={containerRef}>
      <button
        type="button"
        className="mode-picker-toggle"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={activeMode?.description ? `${activeMode.name}: ${activeMode.description}` : `Mode: ${activeMode?.name}`}
        onClick={() => setOpen(!open)}
      >
        <span
          className="btn-icon-svg"
          dangerouslySetInnerHTML={{ __html: ICONS.shield }}
        />
        <span className="mode-picker-name">{activeMode?.name ?? activeId}</span>
        <span
          className="btn-icon-svg mode-picker-chevron"
          dangerouslySetInnerHTML={{ __html: ICONS.chevronDown }}
        />
      </button>

      {open && (
        <div className="mode-picker-panel" role="listbox">
          <div className="mode-picker-header">Session Mode</div>
          <div className="mode-picker-options">
            {availableModes.map((mode) => {
              const isSelected = mode.id === activeId;
              return (
                <button
                  key={mode.id}
                  type="button"
                  className={`mode-picker-option ${isSelected ? "active" : ""}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onModeChange(mode.id);
                    setOpen(false);
                  }}
                >
                  <div className="mode-picker-option-row">
                    <span className="mode-picker-option-name">{mode.name}</span>
                    {isSelected && (
                      <span
                        className="btn-icon-svg"
                        dangerouslySetInnerHTML={{ __html: ICONS.check }}
                      />
                    )}
                  </div>
                  {mode.description && (
                    <span className="mode-picker-option-desc">
                      {mode.description}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
