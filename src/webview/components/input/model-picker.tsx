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
  const [cardPlacement, setCardPlacement] = useState<"above" | "below">("above");
  const [menuPlacement, setMenuPlacement] = useState<"above" | "below">("above");
  const [menuMaxHeight, setMenuMaxHeight] = useState<number>(300);
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
    if (modelsOpen && availableModels.length > 0) {
      const selectedIndex = Math.max(0, availableModels.indexOf(selectedModel ?? ""));
      const selectedEl = modelOptions.current
        ?.querySelectorAll<HTMLButtonElement>("[data-model]")
        [selectedIndex];
      selectedEl?.focus({ preventScroll: true });
      selectedEl?.scrollIntoView({ block: "nearest" });
    }
  }, [open, modelsOpen, disabled, availableModels, selectedModel]);

  useLayoutEffect(() => {
    if (!open) return;
    const calculateLayout = () => {
      const popup = panel.current;
      const anchor = toggle.current?.getBoundingClientRect();
      if (!popup || !anchor) return;

      // 1. Main card placement: pop above by default unless space above is constrained (<110px) and below has more space
      const spaceAboveCard = anchor.top - 8;
      const spaceBelowCard = window.innerHeight - anchor.bottom - 8;
      const nextCardPlacement =
        spaceAboveCard < 110 && spaceBelowCard > spaceAboveCard ? "below" : "above";
      setCardPlacement(nextCardPlacement);

      // 2. Horizontal overflow safeguard
      const popupWidth = popup.offsetWidth;
      const rightEdge = anchor.left + popupWidth;
      const maxRight = window.innerWidth - 12;
      if (rightEdge > maxRight) {
        const overflow = rightEdge - maxRight;
        const maxShift = anchor.left - 12;
        const shift = Math.min(overflow, maxShift);
        popup.style.left = `-${Math.max(0, shift)}px`;
      } else {
        popup.style.left = "0px";
      }

      // 3. Submenu placement: calculate whether models dropdown should pop above or below
      if (modelsOpen) {
        const modelBtn = modelToggle.current?.getBoundingClientRect();
        if (modelBtn) {
          const spaceAboveMenu = Math.max(0, modelBtn.top - 12);
          const spaceBelowMenu = Math.max(0, window.innerHeight - modelBtn.bottom - 12);
          // Only place below if space below has ample room (>=240px) or more than space above
          const placeBelow =
            spaceBelowMenu >= 240 ||
            (spaceBelowMenu >= 160 && spaceBelowMenu >= spaceAboveMenu);
          const nextMenuPlacement = placeBelow ? "below" : "above";
          const availableSpace = placeBelow ? spaceBelowMenu : spaceAboveMenu;
          const maxHeight = Math.min(320, Math.max(120, availableSpace));
          setMenuPlacement(nextMenuPlacement);
          setMenuMaxHeight(maxHeight);
        }
      }
    };

    calculateLayout();
    window.addEventListener("resize", calculateLayout);
    return () => {
      window.removeEventListener("resize", calculateLayout);
    };
  }, [open, modelsOpen]);

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
    if (!showLevels) {
      close();
    }
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
    panel.current
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
          setOpen(!open);
          setModelsOpen(!showLevels);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            close();
          }
          if (event.key === "ArrowDown" || event.key === "Enter") {
            event.preventDefault();
            setOpen(true);
            setModelsOpen(!showLevels);
          }
        }}
      >
        {selectedModel ||
          (availableModels.length ? "Select model" : "Model unavailable")}
        <span aria-hidden="true">⌄</span>
      </button>

      {open && !disabled && (
        <section
          ref={panel}
          role="dialog"
          aria-label="Model and thinking level"
          className={`model-picker-panel model-picker-menu placement-${cardPlacement}`}
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
                  className={`model-picker-model-options placement-${menuPlacement}`}
                  ref={modelOptions}
                  style={{ maxHeight: `${menuMaxHeight}px` }}
                >
                  {availableModels.map((model, index) => (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={model === selectedModel}
                      disabled={disabled}
                      key={model}
                      data-model={model}
                      data-model-option={model}
                      className={model === selectedModel ? "active" : ""}
                      title={model}
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
                      <span className="model-name-text">{model}</span>
                      {model === selectedModel && (
                        <span aria-hidden="true" className="model-check-icon">✓</span>
                      )}
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
                        ? `${((levelFocusIndex + 1) / availableThinkingLevels.length) * 100}%`
                        : "0%",
                  }}
                />
                {availableThinkingLevels.map((level, index) => {
                  const isActive = level === thinkingLevel;
                  const isPast =
                    Boolean(thinkingLevel) &&
                    availableThinkingLevels.includes(thinkingLevel!) &&
                    index < levelFocusIndex;
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      aria-label={level}
                      tabIndex={index === levelFocusIndex ? 0 : -1}
                      key={level}
                      data-level={level}
                      data-thinking-level={level}
                      className={[
                        isActive ? "active" : "",
                        isPast ? "past" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      title={level}
                      disabled={disabled}
                      onClick={() => chooseLevel(level)}
                    >
                      <span aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="model-picker-level-unavailable">
                {availableThinkingLevels.length === 0
                  ? "No thinking levels available"
                  : "Select a model to choose a level"}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
