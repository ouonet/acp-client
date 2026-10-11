// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { ModelPicker } from "../../src/webview/components/input/model-picker";

describe("ModelPicker visual structure & hierarchy verification", () => {
  it("renders a compact card with thinking level on top, model button in middle, and smooth pill slider on bottom", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    const onModelChange = vi.fn();
    const onLevelChange = vi.fn();

    render(
      <ModelPicker
        selectedModel="codex.openai:gpt-6-astra"
        availableModels={["codex.openai:gpt-6-astra", "claude-3-5-sonnet", "gpt-4o"]}
        thinkingLevel="ultra"
        availableThinkingLevels={["off", "low", "medium", "high", "ultra"]}
        onModelChange={onModelChange}
        onThinkingLevelChange={onLevelChange}
      />,
      root,
    );

    // 1. Initially closed
    const toggle = root.querySelector(".model-picker-toggle") as HTMLButtonElement;
    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toContain("codex.openai:gpt-6-astra");
    expect(root.querySelector(".model-picker-panel")).toBeNull();

    // 2. Open panel
    await act(async () => {
      toggle.click();
    });

    const panel = root.querySelector(".model-picker-panel") as HTMLElement;
    expect(panel).not.toBeNull();

    // Verify thinking level value is centered on top
    const thinkingHeading = panel.querySelector(".model-picker-thinking-heading");
    expect(thinkingHeading).not.toBeNull();
    expect(thinkingHeading?.querySelector(".model-picker-thinking-value")?.textContent).toBe("ultra");

    // Verify model toggle button is in the middle
    const modelToggle = panel.querySelector(".model-picker-model-toggle") as HTMLButtonElement;
    expect(modelToggle).not.toBeNull();
    expect(modelToggle.textContent).toContain("codex.openai:gpt-6-astra");

    // By default, models dropdown is closed (so slider is cleanly visible)
    expect(panel.querySelector(".model-picker-model-options")).toBeNull();

    // Verify smooth pill slider track is on bottom
    const track = panel.querySelector(".model-picker-level-track") as HTMLElement;
    expect(track).not.toBeNull();
    const fill = track.querySelector(".model-picker-level-fill") as HTMLElement;
    expect(fill.style.width).toBe("100%"); // "ultra" is 5th of 5 -> 100%

    // Clicking model button opens the models options dropdown
    await act(async () => {
      modelToggle.click();
    });
    const modelOptions = panel.querySelector(".model-picker-model-options");
    expect(modelOptions).not.toBeNull();
    expect(modelOptions?.querySelectorAll("button").length).toBe(3);

    // Clean up
    root.remove();
  });
});
