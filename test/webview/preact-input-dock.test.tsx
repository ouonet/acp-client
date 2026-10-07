// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { AppStore } from "../../src/webview/state/app-store";
import { StoreProvider } from "../../src/webview/state/store-context";
import { ActionProvider } from "../../src/webview/state/action-context";
import { HeaderBar } from "../../src/webview/components/header/header-bar";
import { InputDock } from "../../src/webview/components/input/input-dock";

describe("T5: Preact Header & InputDock Components", () => {
  let container: HTMLElement;
  let store: AppStore;
  let onAction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(container);
    store = new AppStore();
    onAction = vi.fn();

    // Populate mock initial snapshot
    store.dispatch({
      type: "APPLY_SNAPSHOT",
      payload: {
        activeSession: {
          id: "sess-1",
          agentId: "agent-1",
          title: "Session 1",
          status: "idle",
          messages: [],
          model: "claude-3-7-sonnet",
          thinkingLevel: "high",
        },
        agentConfigs: [
          {
            id: "agent-1",
            name: "Claude Agent",
            command: "node",
            args: [],
            env: {},
            transport: "stdio",
            enabled: true,
          },
        ],
        processStatuses: { "agent-1": "running" },
        inputHistory: ["prior prompt 1", "prior prompt 2"],
        skills: [{ id: "skill-1", name: "review", description: "Review code" }],
      },
    });
  });

  it("HeaderBar renders Agent connection tabs and dispatches a correlated connect action", () => {
    store.dispatch({ type: "APPLY_SNAPSHOT", payload: { agentConfigs: store.getState().agent.agentConfigs, activeAgentId: "agent-1", connections: [{ agentId: "agent-1", status: "running", initialized: true, generation: 1 }] } });
    render(
      <StoreProvider store={store}>
        <ActionProvider onAction={onAction}>
          <HeaderBar />
        </ActionProvider>
      </StoreProvider>,
      container,
    );

    const statusDot = container.querySelector(".status-dot");
    expect(statusDot).not.toBeNull();
    expect(statusDot?.classList.contains("running")).toBe(true);

    const tab = container.querySelector('[role="tab"][aria-selected="true"]');
    expect(tab?.textContent).toContain("Claude Agent");

    const connectBtn = container.querySelector(".connect-menu button") as HTMLButtonElement;
    expect(connectBtn).not.toBeNull();
    connectBtn.click();
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CONNECT_AGENT",
        payload: expect.objectContaining({ agentId: "agent-1", requestId: expect.any(String) }),
      }),
    );
  });

  it("InputDock renders textarea, typing updates state, and clicking Send dispatches SEND_PROMPT", async () => {
    render(
      <StoreProvider store={store}>
        <ActionProvider onAction={onAction}>
          <InputDock />
        </ActionProvider>
      </StoreProvider>,
      container,
    );
    await new Promise((r) => setTimeout(r, 20));

    const textarea = container.querySelector("textarea.prompt-input") as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();

    textarea.value = "Hello Preact";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));

    const sendBtn = container.querySelector(".btn-toggle-action.send") as HTMLButtonElement;
    expect(sendBtn).not.toBeNull();
    sendBtn.click();

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SEND_PROMPT",
        payload: expect.objectContaining({
          sessionId: "sess-1",
          prompt: "Hello Preact",
        }),
      }),
    );
  });

  it("InputDock toggles to Stop button when session is streaming and dispatches CANCEL_PROMPT", () => {
    store.dispatch({ type: "SESSION_STATUS_CHANGE", payload: { status: "streaming" } });

    render(
      <StoreProvider store={store}>
        <ActionProvider onAction={onAction}>
          <InputDock />
        </ActionProvider>
      </StoreProvider>,
      container,
    );

    const stopBtn = container.querySelector(".btn-toggle-action.stop") as HTMLButtonElement;
    expect(stopBtn).not.toBeNull();
    expect(stopBtn.textContent).toContain("Stop");

    stopBtn.click();
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CANCEL_PROMPT",
        payload: { sessionId: "sess-1" },
      }),
    );
  });

  it("InputDock navigates history on Up and Down arrow keys", () => {
    render(
      <StoreProvider store={store}>
        <ActionProvider onAction={onAction}>
          <InputDock />
        </ActionProvider>
      </StoreProvider>,
      container,
    );

    const textarea = container.querySelector("textarea.prompt-input") as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();

    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(store.getState().input.draft).toBe("prior prompt 2");

    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(store.getState().input.draft).toBe("prior prompt 1");

    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(store.getState().input.draft).toBe("prior prompt 2");
  });

  it("InputDock displays SlashPopup when draft starts with / and inserts command on selection", async () => {
    render(
      <StoreProvider store={store}>
        <ActionProvider onAction={onAction}>
          <InputDock />
        </ActionProvider>
      </StoreProvider>,
      container,
    );
    await new Promise((r) => setTimeout(r, 20));

    const textarea = container.querySelector("textarea.prompt-input") as HTMLTextAreaElement;
    textarea.value = "/rev";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));

    const popup = container.querySelector(".slash-popup");
    expect(popup).not.toBeNull();
    const item = container.querySelector(".slash-item");
    expect(item).not.toBeNull();
    expect(item?.textContent).toContain("review");

    (item as HTMLElement).click();
    expect(store.getState().input.draft).toContain("/review");
  });

  async function openSlashMenu(draft = "/") {
    store.dispatch({
      type: "SESSION_EVENT",
      payload: {
        type: "available_commands_update",
        sessionId: "sess-1",
        payload: {
          availableCommands: [
            { name: "plan", description: "Plan the work" },
            { name: "compact", description: "Compress context" },
          ],
        },
      },
    });

    act(() => {
      render(
        <StoreProvider store={store}>
          <ActionProvider onAction={onAction}>
            <InputDock />
          </ActionProvider>
        </StoreProvider>,
        container,
      );
    });

    const textarea = container.querySelector("textarea.prompt-input") as HTMLTextAreaElement;
    act(() => {
      textarea.value = draft;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return textarea;
  }

  function press(textarea: HTMLTextAreaElement, key: string) {
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
  }

  it("InputDock highlights slash items with arrow keys instead of navigating prompt history", async () => {
    const textarea = await openSlashMenu();

    expect(container.querySelector(".slash-item.active .slash-name")?.textContent).toBe("/plan");

    press(textarea, "ArrowDown");
    expect(store.getState().input.draft).toBe("/");
    expect(container.querySelector(".slash-item.active .slash-name")?.textContent).toBe("/compact");

    press(textarea, "ArrowUp");
    expect(store.getState().input.draft).toBe("/");
    expect(container.querySelector(".slash-item.active .slash-name")?.textContent).toBe("/plan");

    press(textarea, "ArrowUp");
    expect(store.getState().input.draft).toBe("/");
    expect(container.querySelector(".slash-item.active .slash-name")?.textContent).toBe("/review");
  });

  it("InputDock inserts the highlighted slash command on Enter and Tab without sending", async () => {
    const textarea = await openSlashMenu();
    press(textarea, "ArrowDown");
    press(textarea, "Enter");

    expect(store.getState().input.draft).toBe("/compact ");
    expect(onAction).not.toHaveBeenCalled();
    expect(container.querySelector(".slash-popup")).toBeNull();

    act(() => {
      textarea.value = "/plan";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    press(textarea, "Tab");

    expect(store.getState().input.draft).toBe("/plan ");
    expect(onAction).not.toHaveBeenCalled();
  });

  it("InputDock dismisses the slash menu on Escape and then uses arrow keys for history", async () => {
    const textarea = await openSlashMenu();
    expect(container.querySelector(".slash-popup")).not.toBeNull();

    press(textarea, "Escape");
    expect(container.querySelector(".slash-popup")).toBeNull();
    expect(store.getState().input.draft).toBe("/");

    press(textarea, "ArrowUp");
    expect(store.getState().input.draft).toBe("prior prompt 2");
  });
});

describe("Agent-driven combined picker", () => {
  it("switches model on click and only offers returned levels after acknowledgment", async () => {
    const { ModelPicker } = await import("../../src/webview/components/input/model-picker");
    const root = document.createElement("div");
    const onModelChange = vi.fn();
    const onThinkingLevelChange = vi.fn();
    const view = (model: string, levels: string[], disabled = false) => <ModelPicker
      selectedModel={model} availableModels={["old", "new"]} thinkingLevel={levels[0]}
      availableThinkingLevels={levels} disabled={disabled} onModelChange={onModelChange}
      onThinkingLevelChange={onThinkingLevelChange} />;
    render(view("old", ["deep"]), root);
    expect(root.querySelectorAll("select")).toHaveLength(0);
    await act(async () => { (root.querySelector("button.model-picker-toggle") as HTMLButtonElement).click(); });
    await act(async () => { (root.querySelector('[data-model="new"]') as HTMLButtonElement).click(); });
    expect(onModelChange).toHaveBeenCalledWith("new");
    await act(async () => { render(view("old", ["deep"], true), root); });
    expect(root.querySelector('[data-level="deep"]')).toBeNull();
    await act(async () => { render(view("new", ["ultra", "deep"]), root); });
    (root.querySelector('[data-level="deep"]') as HTMLButtonElement).click();
    expect(onThinkingLevelChange).toHaveBeenCalledWith("deep");
  });
});

describe("combined picker completion", () => {
  it("closes and returns focus to its trigger after choosing a thinking level", async () => {
    const { ModelPicker } = await import("../../src/webview/components/input/model-picker");
    const root = document.createElement("div");
    document.body.appendChild(root);
    const onLevelChange = vi.fn();
    render(<ModelPicker selectedModel="one" availableModels={["one"]}
      thinkingLevel="low" availableThinkingLevels={["low", "deep"]}
      onModelChange={vi.fn()} onThinkingLevelChange={onLevelChange} />, root);
    const trigger = root.querySelector(".model-picker-toggle") as HTMLButtonElement;
    await act(async () => { trigger.click(); });
    await act(async () => { (root.querySelector('[data-level="deep"]') as HTMLButtonElement).click(); });
    expect(onLevelChange).toHaveBeenCalledWith("deep");
    expect(root.querySelector(".model-picker-menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("combined picker keyboard behavior", () => {
  it("opens with ArrowDown and returns focus on Escape", async () => {
    const { ModelPicker } = await import("../../src/webview/components/input/model-picker");
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(<ModelPicker selectedModel="one" availableModels={["one", "two"]}
      availableThinkingLevels={[]} onModelChange={vi.fn()} onThinkingLevelChange={vi.fn()} />, root);
    const trigger = root.querySelector(".model-picker-toggle") as HTMLButtonElement;
    trigger.focus();
    await act(() => { trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
    expect(root.querySelector('[data-model="one"]')).toBe(document.activeElement);
    await act(() => { (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(root.querySelector(".model-picker-menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
