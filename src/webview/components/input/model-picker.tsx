import { createPortal } from "preact/compat";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
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
  const [modelsOpen, setModelsOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ left: 12, top: 12 });
  const [modelMenuPosition, setModelMenuPosition] = useState({
    left: 12,
    top: 12,
    width: 220,
    maxHeight: 240,
  });
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const modelToggle = useRef<HTMLButtonElement>(null);
  const modelOptions = useRef<HTMLDivElement>(null);
  const levelFocusIndex = Math.max(
    0,
    availableThinkingLevels.indexOf(thinkingLevel ?? ""),
  );
  const showLevels =
    availableThinkingLevels.length > 0 &&
    (Boolean(selectedModel) || availableModels.length === 0);
  const hasOptions = availableModels.length > 0 || showLevels;

  useEffect(() => {
    if (!open || disabled) return;
    modelToggle.current?.focus({ preventScroll: true });
  }, [open, disabled]);
  useEffect(() => {
    if (!modelsOpen || disabled) return;
    const selectedIndex = Math.max(0, availableModels.indexOf(selectedModel ?? ""));
    modelOptions.current
      ?.querySelectorAll<HTMLButtonElement>("[data-model-option]")
      [selectedIndex]?.focus({ preventScroll: true });
  }, [modelsOpen, disabled, availableModels, selectedModel]);
  useLayoutEffect(() => {
    if (!open) return;
    const positionPanel = () => {
      const anchor = toggle.current?.getBoundingClientRect();
      const popup = panel.current;
      if (!anchor || !popup) return;
      const left = Math.max(
        12,
        Math.min(anchor.left, window.innerWidth - popup.offsetWidth - 12),
      );
      const above = anchor.top - popup.offsetHeight - 8;
      const top =
        above >= 12
          ? above
          : Math.max(
              12,
              Math.min(anchor.bottom + 8, window.innerHeight - popup.offsetHeight - 12),
            );
      setPanelPosition((current) =>
        current.left === left && current.top === top ? current : { left, top },
      );
    };
    positionPanel();
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    return () => {
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!modelsOpen) return;
    const positionMenu = () => {
      const anchor = modelToggle.current?.getBoundingClientRect();
      const menu = modelOptions.current;
      if (!anchor || !menu) return;
      const desiredHeight = Math.min(320, window.innerHeight * 0.45, menu.scrollHeight);
      const spaceAbove = Math.max(0, anchor.top - 13);
      const spaceBelow = Math.max(0, window.innerHeight - anchor.bottom - 13);
      const placeBelow = spaceBelow >= desiredHeight || spaceBelow >= spaceAbove;
      const availableSpace = placeBelow ? spaceBelow : spaceAbove;
      const maxHeight = Math.min(desiredHeight, Math.max(48, availableSpace));
      const height = Math.min(menu.scrollHeight, maxHeight);
      const left = Math.max(
        12,
        Math.min(anchor.left, window.innerWidth - anchor.width - 12),
      );
      const top = placeBelow ? anchor.bottom + 5 : Math.max(8, anchor.top - height - 5);
      setModelMenuPosition((current) =>
        current.left === left && current.top === top && current.width === anchor.width && current.maxHeight === maxHeight
          ? current
          : { left, top, width: anchor.width, maxHeight },
      );
    };
    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [modelsOpen, panelPosition]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (root.current?.contains(target) || panel.current?.contains(target)) return;
      setOpen(false);
      setModelsOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  if (!hasOptions && !disabled) return null;

  const close = () => {
    setOpen(false);
    setModelsOpen(false);
    toggle.current?.focus({ preventScroll: true });
  };
  const chooseModel = (model: string) => {
    if (disabled) return;
    if (model !== selectedModel) onModelChange(model);
    setModelsOpen(false);
    modelToggle.current?.focus({ preventScroll: true });
  };
  const chooseLevel = (level: string) => {
    if (disabled) return;
    if (level !== thinkingLevel) onThinkingLevelChange(level);
    close();
  };
  const focusLevel = (index: number) => {
    const count = availableThinkingLevels.length;
    if (count === 0) return;
    const next = Math.max(0, Math.min(index, count - 1));
    root.current
      ?.querySelectorAll<HTMLButtonElement>("[data-thinking-level]")
      [next]?.focus();
    chooseLevel(availableThinkingLevels[next]);
  };

  return (
    <div className="model-picker-bar toolbar-left combined-picker" ref={root}>
      <button
        type="button"
        ref={toggle}
        className="model-picker-toggle"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Select model and thinking level"
        disabled={disabled}
        onClick={() => {
          setModelsOpen(false);
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
            setModelsOpen(false);
          }
        }}
      >
        {selectedModel ||
          (availableModels.length ? "Select model" : "Model unavailable")}
        <span aria-hidden="true">⌄</span>
      </button>
      {open &&
        createPortal(
          <section
            ref={panel}
            role="dialog"
            aria-label="Model and thinking level"
            className="model-picker-panel"
            style={{
              position: "fixed",
              left: panelPosition.left,
              top: panelPosition.top,
              bottom: "auto",
              zIndex: 10000,
            }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
        >
          <div className="model-picker-thinking">
            <div className="model-picker-thinking-heading">
              <span className="model-picker-thinking-value">
                {thinkingLevel || "Unavailable"}
              </span>
            </div>
            <div className="model-picker-model">
              <button
                type="button"
                ref={modelToggle}
                className="model-picker-model-toggle"
                aria-haspopup="menu"
                aria-expanded={modelsOpen}
                disabled={disabled || availableModels.length === 0}
                onClick={() => setModelsOpen(!modelsOpen)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" && availableModels.length > 0) {
                    event.preventDefault();
                    setModelsOpen(true);
                  }
                }}
              >
                <span className="model-picker-model-name">
                  {selectedModel || "Select model"}
                </span>
                <span aria-hidden="true" className="model-picker-chevron">
                  ›
                </span>
              </button>
              {modelsOpen && availableModels.length > 0 && (
                <div
                  role="menu"
                  aria-label="Available models"
                  className="model-picker-model-options"
                  ref={modelOptions}
                  style={{
                    position: "fixed",
                    left: modelMenuPosition.left,
                    right: "auto",
                    top: modelMenuPosition.top,
                    bottom: "auto",
                    width: modelMenuPosition.width,
                    maxHeight: modelMenuPosition.maxHeight,
                    zIndex: 10001,
                  }}
                >
                  {availableModels.map((model, index) => (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={model === selectedModel}
                      disabled={disabled}
                      key={model}
                      data-model-option={model}
                      className={model === selectedModel ? "active" : ""}
                      onKeyDown={(event) => {
                        if (event.key !== "ArrowDown" && event.key !== "ArrowUp")
                          return;
                        event.preventDefault();
                        event.stopPropagation();
                        const step = event.key === "ArrowDown" ? 1 : -1;
                        const menu = modelOptions.current;
                        const option = menu?.querySelectorAll<HTMLButtonElement>(
                          "[data-model-option]",
                        )[(index + step + availableModels.length) % availableModels.length];
                        if (!menu || !option) return;
                        option.focus({ preventScroll: true });
                        const menuBounds = menu.getBoundingClientRect();
                        const optionBounds = option.getBoundingClientRect();
                        if (optionBounds.top < menuBounds.top) {
                          menu.scrollTop -= menuBounds.top - optionBounds.top;
                        } else if (optionBounds.bottom > menuBounds.bottom) {
                          menu.scrollTop += optionBounds.bottom - menuBounds.bottom;
                        }
                      }}
                      onClick={() => chooseModel(model)}
                    >
                      <span>{model}</span>
                      {model === selectedModel && <span aria-hidden="true">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {showLevels ? (
              <div
                role="radiogroup"
                aria-label="Thinking level"
                className="model-picker-level-track"
                style={{
                  gridTemplateColumns: `repeat(${availableThinkingLevels.length}, minmax(0, 1fr))`,
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "ArrowLeft" ||
                    event.key === "ArrowRight" ||
                    event.key === "Home" ||
                    event.key === "End"
                  ) {
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? availableThinkingLevels.length - 1
                          : levelFocusIndex + (event.key === "ArrowRight" ? 1 : -1);
                    focusLevel(next);
                  }
                }}
              >
                <span
                  className="model-picker-level-fill"
                  aria-hidden="true"
                  style={{
                    width:
                      thinkingLevel && availableThinkingLevels.includes(thinkingLevel)
                        ? `${((levelFocusIndex + 0.5) / availableThinkingLevels.length) * 100}%`
                        : "0%",
                  }}
                />
                {availableThinkingLevels.map((level, index) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={level === thinkingLevel}
                    aria-label={level}
                    tabIndex={index === levelFocusIndex ? 0 : -1}
                    key={level}
                    data-thinking-level={level}
                    className={level === thinkingLevel ? "active" : ""}
                    title={level}
                    disabled={disabled}
                    onClick={() => chooseLevel(level)}
                  >
                    <span aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="model-picker-level-unavailable">
                {availableThinkingLevels.length === 0
                  ? "No thinking levels available"
                  : "Select a model to choose a level"}
              </div>
            )}
          </div>
          </section>,
          document.body,
        )}
    </div>
  );
}
